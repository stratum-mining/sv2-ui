import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import path from 'node:path';
import { parse as parseTOML, stringify as stringifyTOML } from 'smol-toml';
import { buildJdClientConfig, buildTranslatorConfig } from '../../../src/config-templates/config-builder.js';
import { CONFIG_DIR, CONFIG_FILES, CONTAINER_NAMES, PORTS } from '../constants.js';
import type { SetupRequest } from '../types.js';
import type { ConfigTemplateData } from '../../../src/config-templates/types.js';

// Resolve a hostname to an IP. Returns the input unchanged if it's already an IP.
async function resolveToIp(host: string): Promise<string> {
  if (!host || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return host;
  try {
    const { address } = await lookup(host, { family: 4 });
    return address;
  } catch {
    return host; // fallback to original if DNS fails
  }
}

/**
 * True for plain TOML table objects ({...}), false for arrays, primitives,
 * and smol-toml's special datetime instances (whose prototype is not Object.prototype).
 */
function isPlainObject(val: unknown): val is Record<string, any> {
  return (
    val !== null &&
    typeof val === 'object' &&
    !Array.isArray(val) &&
    Object.getPrototypeOf(val) === Object.prototype
  );
}

/**
 * Recursively merge two parsed TOML objects, with wizard values taking
 * precedence for shared keys.
 *
 * Rules:
 *  - Plain sub-tables ([section]): merged recursively — user-added keys inside
 *    any nested section survive; wizard-controlled keys are updated.
 *  - Scalar arrays (supported_extensions, required_extensions, …): wizard wins
 *    outright (entire array replaced).
 *  - Array-of-tables ([[upstreams]]): treated as a scalar here — replaced by
 *    wizard wholesale. The caller applies upstreams-specific logic afterwards.
 *  - Top-level scalars (strings, numbers, booleans): wizard wins.
 *  - Keys present only in the existing config (e.g. log_file, data_dir, any
 *    future manual addition): always preserved unchanged.
 */
function deepMerge(existing: Record<string, any>, wizard: Record<string, any>): Record<string, any> {
  // Start from a copy of existing so keys absent from the wizard are kept.
  const result: Record<string, any> = { ...existing };

  for (const key of Object.keys(wizard)) {
    const wizardVal = wizard[key];
    const existingVal = existing[key];

    if (isPlainObject(wizardVal) && isPlainObject(existingVal)) {
      // Both sides have a plain table for this key — recurse.
      result[key] = deepMerge(existingVal, wizardVal);
    } else {
      // Scalar, array, new key, or type mismatch — wizard wins.
      result[key] = wizardVal;
    }
  }

  return result;
}

/**
 * Merge wizard-generated TOML with the existing config file on disk.
 *
 * Wizard-controlled fields are always updated. Fields that exist only in the
 * manual config (log_file, data_dir, extra [[upstreams]] entries, any custom
 * key in any nested section) are preserved untouched.
 */
async function mergeWithExisting(wizardToml: string, configPath: string): Promise<string> {
  let existingObj: Record<string, any> = {};
  try {
    const raw = await readFile(configPath, 'utf-8');
    existingObj = parseTOML(raw) as Record<string, any>;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // No existing file — use wizard output as-is.
      return wizardToml;
    }
    // File exists but failed to parse (e.g. user saved malformed TOML via the
    // editor). Log a warning so the problem is visible in server logs.
    console.warn(
      `[config merge] Could not parse existing config at ${configPath} — ` +
      `falling back to wizard output. Error: ${err.message ?? err}`
    );
    return wizardToml;
  }

  const wizardObj = parseTOML(wizardToml) as Record<string, any>;

  // Deep-merge: nested tables are merged recursively so user-added keys in any
  // section survive. Scalars and arrays use the wizard value.
  const merged = deepMerge(existingObj, wizardObj);

  // [[upstreams]] special case: wizard owns index 0 (the primary upstream) but
  // any extra entries the user added (index 1+) are preserved unchanged.
  const wizardUpstreams: any[] = wizardObj['upstreams'] ?? [];
  const existingUpstreams: any[] = existingObj['upstreams'] ?? [];
  if (wizardUpstreams.length > 0 || existingUpstreams.length > 0) {
    merged['upstreams'] = [...wizardUpstreams, ...existingUpstreams.slice(1)];
  }

  return stringifyTOML(merged);
}

export async function generateConfigs(data: SetupRequest): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });

  const jdMode = data.constructTemplates;

  // Build translator config
  const translatorTemplateData: ConfigTemplateData = {
    userIdentity: data.userIdentity,
    network: data.selectedNetwork,
    selectedPool: data.selectedPool,
    minIndividualMinerHashrate: data.minIndividualMinerHashrate,
    aggregateChannels: data.aggregateChannels,
    enableVardiff: data.enableVardiff,
    clientSharesPerMinute: data.clientSharesPerMinute,
    upstreamAuthorityPubkey: data.tproxyUpstreamAuthorityPubkey,
  };

  if (jdMode) {
    // In JD mode, translator connects to jd_client, not the pool.
    // Use JDC's authority key (the default), not the pool's.
    translatorTemplateData.upstreamAddress = CONTAINER_NAMES.jd_client;
    translatorTemplateData.upstreamPort = PORTS.jd_client.listening;
    translatorTemplateData.upstreamAuthorityPubkey = undefined;
  }

  const translatorToml = buildTranslatorConfig(translatorTemplateData, {
    useJdc: jdMode,
  });

  const tproxyConfigPath = path.join(CONFIG_DIR, CONFIG_FILES.tproxy);
  const mergedTranslator = await mergeWithExisting(translatorToml, tproxyConfigPath);
  await writeFile(tproxyConfigPath, mergedTranslator, 'utf-8');

  // Build JDC config if in JD mode
  if (jdMode) {
    const jdcTemplateData: ConfigTemplateData = {
      userIdentity: data.userIdentity,
      network: data.selectedNetwork,
      selectedPool: data.selectedPool,
      jdcSignature: data.jdcSignature,
      coinbaseRewardAddress: data.coinbaseRewardScript,
      shareBatchSize: data.clientShareBatchSize,
      feeThreshold: data.clientFeeThreshold,
      minInterval: data.clientMinInterval,
      socketPath: data.socketPath,
    };

    let jdcToml = buildJdClientConfig(jdcTemplateData);

    // JDC requires IP addresses, not hostnames — resolve any hostnames in the config
    const hostnames = jdcToml.matchAll(/(?:pool_address|jds_address)\s*=\s*"([^"]+)"/g);
    for (const match of hostnames) {
      const resolved = await resolveToIp(match[1]);
      if (resolved !== match[1]) {
        jdcToml = jdcToml.replace(match[1], resolved);
      }
    }

    const jdcConfigPath = path.join(CONFIG_DIR, CONFIG_FILES.jd_client);
    const mergedJdc = await mergeWithExisting(jdcToml, jdcConfigPath);
    await writeFile(jdcConfigPath, mergedJdc, 'utf-8');
  }
}
