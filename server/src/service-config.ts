/**
 * Prepare generated service configuration from saved setup data.
 *
 * The setup data is user-owned and canonical. Service TOML files are derived
 * artifacts: every start path renders the complete current set, then
 * reconciles those files before services run.
 *
 * Boundary: this module owns service-config readiness and file lifecycle.
 * config-generator.ts owns the actual Translator/JDC TOML field mapping.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  getMinerTelemetryCidrError,
  isSupportedBitcoinCoreVersion,
  isTomlSafeOptionalString,
  isValidBitcoinAddress,
  isValidBitcoinNetwork,
} from '@sv2-ui/shared';
import { generateJdcConfig, generateTranslatorConfig, normalizeSetupData } from './config-generator.js';
import { ensureConfigDir } from './config-dir.js';
import { writeFileAtomically } from './atomic-write.js';
import { BITCOIN_ERROR_MESSAGES } from './messages.js';
import { getPoolConfigError, MAX_FALLBACK_POOLS } from './pool-validation.js';
import type { PoolConfig, SetupData } from './types.js';

const SERVICE_CONFIG_FILENAMES = ['translator.toml', 'jdc.toml'] as const;

export type ServiceConfigIssue = {
  code: string;
  title: string;
  message: string;
};

export type ServiceConfigFile = {
  filename: typeof SERVICE_CONFIG_FILENAMES[number];
  contents: string;
};

export type PreparedServiceConfig =
  | {
      kind: 'ready';
      data: SetupData;
      files: ServiceConfigFile[];
    }
  | {
      kind: 'needs-setup-review';
      issues: ServiceConfigIssue[];
    };

type PrepareServiceConfigOptions = {
  logFailure?: boolean;
};

function configuredPools(data: SetupData): PoolConfig[] {
  if (data.miningMode === 'solo' && data.mode === 'jd') {
    return [];
  }

  return [
    data.pool,
    ...(data.fallbackPools ?? []),
  ].filter((pool): pool is PoolConfig => Boolean(pool));
}

export function getSetupValidationError(data: SetupData): string | null {
  const hasMiningMode = data.miningMode === 'solo' || data.miningMode === 'pool';
  const hasTemplateMode = data.mode === 'jd' || data.mode === 'no-jd';
  const requiresPool = !(data.miningMode === 'solo' && data.mode === 'jd');

  // These are user choices, not generator defaults. Missing values should send
  // the user back through setup rather than silently picking a mode.
  if (!hasMiningMode || !hasTemplateMode || !data.translator || (requiresPool && !data.pool)) {
    return BITCOIN_ERROR_MESSAGES.missingConfig;
  }

  if (data.mode === 'jd') {
    const { bitcoin: bitcoinConfig, jdc } = data;
    if (!jdc || !bitcoinConfig) {
      return BITCOIN_ERROR_MESSAGES.jdConfig;
    }

    if (!isSupportedBitcoinCoreVersion(bitcoinConfig.core_version)) {
      return BITCOIN_ERROR_MESSAGES.selectVersion;
    }

    if (!isValidBitcoinNetwork(bitcoinConfig.network)) {
      return 'Bitcoin network is required';
    }

    if (typeof bitcoinConfig.socket_path !== 'string' || bitcoinConfig.socket_path.trim().length === 0) {
      return 'Bitcoin IPC socket path is required';
    }

    if (!isValidBitcoinAddress(jdc.coinbase_reward_address, bitcoinConfig.network)) {
      return 'Block reward address is required and must match the selected Bitcoin network';
    }

    if (!isTomlSafeOptionalString(jdc.jdc_signature)) {
      return 'Miner signature cannot contain quotes, backslashes, control characters, or surrounding whitespace';
    }
  }

  if ((data.fallbackPools?.length ?? 0) > MAX_FALLBACK_POOLS) {
    return `No more than ${MAX_FALLBACK_POOLS} fallback pools may be configured`;
  }

  const minerTelemetryCidrError = getMinerTelemetryCidrError(data.miner_telemetry_cidr);
  if (minerTelemetryCidrError) {
    return minerTelemetryCidrError;
  }

  const pools = configuredPools(data);
  for (const [index, pool] of pools.entries()) {
    const error = getPoolConfigError(pool, index === 0 ? 'Primary pool' : `Fallback pool ${index}`);
    if (error) return error;
  }

  return null;
}

export function renderServiceConfigFiles(data: SetupData): ServiceConfigFile[] {
  // TOML structure stays in config-generator.ts; this module only names the
  // generated files that sv2-ui manages on disk.
  const files: ServiceConfigFile[] = [{
    filename: 'translator.toml',
    contents: generateTranslatorConfig(data),
  }];

  if (data.mode === 'jd') {
    const jdcConfig = generateJdcConfig(data);
    if (!jdcConfig) {
      throw new Error('Could not generate the custom-template service configuration');
    }

    files.push({ filename: 'jdc.toml', contents: jdcConfig });
  }

  return files;
}

/**
 * The single preparation boundary used for setup, restart, automatic boot,
 * and status. Safe defaults are normalised automatically. If the current
 * generator cannot render a complete configuration, setup is reviewed rather
 * than attempting to infer or migrate missing user choices.
 */
export function prepareServiceConfig(
  data: SetupData | null,
  options: PrepareServiceConfigOptions = {},
): PreparedServiceConfig {
  try {
    if (!data) throw new Error('Saved setup is empty');

    const normalizedData = normalizeSetupData(data);
    const validationError = getSetupValidationError(normalizedData);
    if (validationError) throw new Error(validationError);

    return {
      kind: 'ready',
      data: normalizedData,
      files: renderServiceConfigFiles(normalizedData),
    };
  } catch (error) {
    if (options.logFailure) {
      console.error('Service config preparation failed:', error);
    }
    // Keep this intentionally generic: the wizard is the recovery path for any
    // missing user choice, including future config requirements.
    return {
      kind: 'needs-setup-review',
      issues: [{
        code: 'saved-setup-needs-review',
        title: 'Review your setup',
        message: 'Review your setup before mining can continue. An update may require confirming a few settings; your saved settings have been kept.',
      }],
    };
  }
}

type ManagedPathKind = 'absent' | 'regular-file' | 'foreign';

type ExistingFile = { contents: string; mode: number };

/**
 * Inspect a managed path without following links. Drift and reconciliation
 * decide based on the directory entry itself: a symlink, FIFO, socket or
 * directory planted at a managed filename is foreign and must never be read
 * through or written through.
 */
async function inspectManagedPath(filePath: string): Promise<ManagedPathKind> {
  try {
    const stat = await fs.lstat(filePath);
    return stat.isFile() ? 'regular-file' : 'foreign';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'absent';
    throw error;
  }
}

async function readExistingFile(filePath: string): Promise<ExistingFile | null> {
  let handle: fs.FileHandle | null = null;
  try {
    // O_NOFOLLOW refuses a symlinked entry and O_NONBLOCK keeps a
    // concurrently planted FIFO from wedging the open. ENOENT, ENXIO (opening
    // a Unix socket) and ELOOP (an entry swapped to a link after the lstat)
    // all read as "nothing usable at this path".
    handle = await fs.open(
      filePath,
      fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW,
    );
    const stat = await handle.stat();
    if (!stat.isFile()) return null;
    // The mode travels along so reconcile can migrate files written before
    // the owner-only policy without rewriting their contents.
    return { contents: await handle.readFile('utf8'), mode: stat.mode & 0o777 };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENXIO' || code === 'ELOOP') return null;
    throw error;
  } finally {
    await handle?.close();
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/**
 * Bring a managed regular file to the requested mode through a no-follow
 * descriptor, without rewriting its contents. Best-effort on races (the entry
 * may vanish or swap while re-opening) and on unprivileged EPERM: a file we
 * cannot chmod must not fail the whole reconcile.
 */
async function tightenFileMode(filePath: string, mode: number): Promise<void> {
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(
      filePath,
      fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW,
    );
    await handle.chmod(mode);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENXIO' || code === 'ELOOP') return;
    if (code === 'EPERM' || code === 'EACCES') {
      console.warn(`Could not restrict permissions of ${filePath}: ${code}`);
      return;
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

/**
 * Check the managed generated files without changing them. Call this before
 * declaring a running stack healthy: a changed app may need a controlled
 * restart even while old containers are still alive.
 */
export async function getServiceConfigDrift(
  files: ServiceConfigFile[],
  configDir: string,
): Promise<string[]> {
  const desiredByName = new Map(files.map((file) => [file.filename, file.contents]));
  const drift: string[] = [];

  for (const filename of SERVICE_CONFIG_FILENAMES) {
    const filePath = path.join(configDir, filename);
    const desiredContents = desiredByName.get(filename);

    if (desiredContents === undefined) {
      if (await pathExists(filePath)) drift.push(filename);
      continue;
    }

    // Anything other than a regular file is drift, even when a symlink
    // happens to resolve to matching contents.
    const kind = await inspectManagedPath(filePath);
    const existing = kind === 'regular-file' ? await readExistingFile(filePath) : null;
    if (existing?.contents !== desiredContents) {
      drift.push(filename);
    }
  }

  return drift;
}

/**
 * Reconcile the complete managed generated-file set. Each replacement is
 * atomic; if a host stops between files, the next boot sees drift and repairs
 * the complete set before restarting services.
 */
export async function reconcileServiceConfigFiles(
  files: ServiceConfigFile[],
  configDir: string,
): Promise<string[]> {
  await ensureConfigDir(configDir);

  const desiredByName = new Map(files.map((file) => [file.filename, file.contents]));
  const changedFiles: string[] = [];

  for (const filename of SERVICE_CONFIG_FILENAMES) {
    const filePath = path.join(configDir, filename);
    const desiredContents = desiredByName.get(filename);

    if (desiredContents === undefined) {
      if (await pathExists(filePath)) {
        await fs.rm(filePath, { recursive: true, force: true });
        changedFiles.push(filename);
      }
      continue;
    }

    // A symlink, FIFO or socket planted at a managed filename is replaced by
    // the generated regular file, never written through.
    if (await inspectManagedPath(filePath) === 'foreign') {
      await fs.rm(filePath, { recursive: true, force: true });
    }

    const existing = await readExistingFile(filePath);
    if (existing && existing.contents === desiredContents) {
      // Contents match, but files written before the owner-only policy may
      // still carry a permissive mode: tighten it in place.
      if (existing.mode !== 0o600) {
        await tightenFileMode(filePath, 0o600);
        changedFiles.push(filename);
      }
      continue;
    }

    await writeFileAtomically(filePath, desiredContents, { mode: 0o600 });
    changedFiles.push(filename);
  }

  return changedFiles;
}

export async function reconcileServiceConfigs(
  data: SetupData,
  configDir: string,
): Promise<string[]> {
  const prepared = prepareServiceConfig(data);
  if (prepared.kind !== 'ready') {
    throw new Error(prepared.issues[0]?.message ?? 'Setup needs review');
  }
  return reconcileServiceConfigFiles(prepared.files, configDir);
}
