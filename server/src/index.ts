/**
 * sv2-ui Backend Server
 * 
 * Handles Docker orchestration for the SV2 mining stack.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

import type { PoolConfig, SetupData, StatusResponse, SetupResponse } from './types.js';
import { generateTranslatorConfig, generateJdcConfig, normalizeSetupData } from './config-generator.js';
import {
  isSupportedBitcoinCoreVersion,
  normalizeBitcoinCoreVersion,
  TRANSLATOR_MONITORING_PORT,
  JDC_MONITORING_PORT,
  MAX_FALLBACK_POOLS,
} from '@sv2-ui/shared';
import { BITCOIN_ERROR_MESSAGES } from './messages.js';
import {
  startStack,
  stopStack,
  getStackStatus,
  isDockerAvailable,
  ensureDockerAvailable,
  getDockerConnectionInfo,
  expandHomePath,
  readContainerLogs,
  probeBitcoinSocketWithDocker,
  autoDiscoverBitcoinRpc
} from './docker.js';
import { getLogDiagnostics, getLogStreams, readCollatedLogLines } from './logs/diagnostics.js';
import { ActivePoolTracker } from './active-pool.js';
import { getPoolConfigError } from './pool-validation.js';
import {
  collectPaginatedMonitoringItems,
  getTelegramWorkerCount,
  TelegramApiError,
  TelegramConfigError,
  TelegramService,
} from './telegram.js';
import type {
  TelegramActivitySnapshot,
  TelegramMiningChannel,
  TelegramSettingsUpdate,
} from './telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Config storage
const CONFIG_DIR = process.env.CONFIG_DIR || path.join(__dirname, '../../data/config');
const STATE_FILE = path.join(CONFIG_DIR, 'state.json');
const TELEGRAM_SETTINGS_FILE = path.join(CONFIG_DIR, 'telegram.json');

const AUTO_START_RETRY_INTERVAL_MS = 30_000;
const TELEGRAM_POLL_INTERVAL_MS = 5_000;

type StackBusyReason = 'auto-start' | 'manual';

let stackBusyReason: StackBusyReason | null = null;
const activePoolTracker = new ActivePoolTracker(readContainerLogs);
const telegramService = new TelegramService(TELEGRAM_SETTINGS_FILE);
let telegramMonitorTimer: ReturnType<typeof setInterval> | null = null;

type SavedState = {
  configured: boolean;
  miningMode: 'solo' | 'pool' | null;
  mode: 'jd' | 'no-jd' | null;
  data: SetupData | null;
  shouldBeRunning: boolean;
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the built UI
// In Docker (NODE_ENV=production): /app/public
// In development: ../../dist (relative to server/dist/)
const UI_DIR = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, '../public')
  : path.join(__dirname, '../../dist');
app.use(express.static(UI_DIR));

/**
 * Load saved state
 */
function getDefaultState(): SavedState {
  return { configured: false, miningMode: null, mode: null, data: null, shouldBeRunning: false };
}

function normalizeSavedState(state: Partial<SavedState>): SavedState {
  const configured = state.configured ?? false;
  return {
    configured,
    miningMode: state.miningMode ?? null,
    mode: state.mode ?? null,
    data: normalizePersistedSetupData(state.data ?? null),
    shouldBeRunning: state.shouldBeRunning ?? configured,
  };
}

function normalizePersistedSetupData(data: SetupData | null): SetupData | null {
  const normalizedBitcoinData = normalizeSetupBitcoinCoreVersion(data);
  return normalizedBitcoinData ? normalizeSetupData(normalizedBitcoinData) : null;
}

function normalizeSetupBitcoinCoreVersion(data: SetupData | null): SetupData | null {
  if (!data?.bitcoin) {
    return data;
  }

  return {
    ...data,
    bitcoin: {
      ...data.bitcoin,
      core_version: normalizeBitcoinCoreVersion(data.bitcoin.core_version),
    },
  };
}

async function loadState(): Promise<SavedState> {
  try {
    const content = await fs.readFile(STATE_FILE, 'utf-8');
    return normalizeSavedState(JSON.parse(content) as Partial<SavedState>);
  } catch {
    return getDefaultState();
  }
}

/**
 * Save state
 */
async function saveState(data: SetupData, shouldBeRunning = true): Promise<void> {
  const normalizedData = normalizePersistedSetupData(data) ?? data;
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify({
    configured: true,
    miningMode: normalizedData.miningMode,
    mode: normalizedData.mode,
    data: normalizedData,
    shouldBeRunning,
  }, null, 2));
}

function configuredPools(data: SetupData): PoolConfig[] {
  if (data.miningMode === 'solo' && data.mode === 'jd') {
    return [];
  }

  return [
    data.pool,
    ...(data.fallbackPools ?? []),
  ].filter((pool): pool is PoolConfig => Boolean(pool));
}

function getSetupValidationError(data: SetupData): string | null {
  const requiresPool = !(data.miningMode === 'solo' && data.mode === 'jd');

  if (!data.mode || !data.translator || (requiresPool && !data.pool)) {
    return BITCOIN_ERROR_MESSAGES.missingConfig;
  }

  if (data.mode === 'jd' && (!data.jdc || !data.bitcoin)) {
    return BITCOIN_ERROR_MESSAGES.jdConfig;
  }

  if ((data.fallbackPools?.length ?? 0) > MAX_FALLBACK_POOLS) {
    return `No more than ${MAX_FALLBACK_POOLS} fallback pools may be configured`;
  }

  const pools = configuredPools(data);
  for (const [index, pool] of pools.entries()) {
    const error = getPoolConfigError(pool, index === 0 ? 'Primary pool' : `Fallback pool ${index}`);
    if (error) return error;
  }

  return null;
}

function getBitcoinCoreVersionError(data: SetupData): string | null {
  if (data.mode !== 'jd') {
    return null;
  }

  if (!isSupportedBitcoinCoreVersion(data.bitcoin?.core_version)) {
    return BITCOIN_ERROR_MESSAGES.selectVersion;
  }

  return null;
}

function isStackRunning(
  mode: SavedState['mode'],
  containers: StatusResponse['containers']
): boolean {
  const healthyOrStarting = (status: string | undefined) =>
    status === 'healthy' || status === 'starting';

  return mode === 'jd'
    ? healthyOrStarting(containers.translator?.status) && healthyOrStarting(containers.jdc?.status)
    : healthyOrStarting(containers.translator?.status);
}

function beginStackOperation(reason: StackBusyReason): boolean {
  if (stackBusyReason) return false;
  stackBusyReason = reason;
  return true;
}

function finishStackOperation(reason: StackBusyReason): void {
  if (stackBusyReason === reason) {
    stackBusyReason = null;
  }
}

function stackBusyResponse() {
  return {
    success: false,
    error: stackBusyReason === 'auto-start'
      ? 'Mining services are already starting. Please wait.'
      : 'Mining services are busy. Please wait.',
  };
}

async function getCurrentStatus(): Promise<StatusResponse> {
  const state = await loadState();
  const containers = await getStackStatus(state.mode);
  const running = isStackRunning(state.mode, containers);
  const isSovereignSolo = state.data?.miningMode === 'solo' && state.data?.mode === 'jd';
  const pools = state.data && !isSovereignSolo ? configuredPools(state.data) : [];

  if (!running) {
    activePoolTracker.reset();
  }

  const activePool = running && state.mode && pools.length > 0
    ? await activePoolTracker.getActivePool(
        state.mode === 'jd' ? 'jdc' : 'translator',
        pools
      )
    : null;

  return {
    configured: state.configured,
    running,
    autoStarting: stackBusyReason === 'auto-start',
    shouldBeRunning: state.shouldBeRunning,
    miningMode: state.miningMode,
    mode: state.mode,
    poolName: isSovereignSolo
      ? 'Sovereign Solo Mining'
      : (activePool?.name ?? null),
    activePoolIndex: activePool?.index ?? null,
    containers,
  };
}

/**
 * GET /api/health - Health check
 */
app.get('/api/health', async (_req, res) => {
  const dockerOk = await isDockerAvailable();
  res.json({
    status: 'ok',
    docker: dockerOk,
  });
});

/**
 * GET /api/status - Get current stack status
 */
app.get('/api/status', async (_req, res) => {
  try {
    res.json(await getCurrentStatus());
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

/**
 * GET /api/config - Get current configuration
 */
app.get('/api/config', async (_req, res) => {
  try {
    const state = await loadState();
    res.json({
      configured: state.configured,
      config: state.data,
    });
  } catch (error) {
    console.error('Config error:', error);
    res.status(500).json({ error: 'Failed to get config' });
  }
});


/**
 * GET /api/env - Host environment variables relevant to the UI
 */
app.get('/api/env', (_req, res) => {
  res.json({ HOST_OS: process.env.HOST_OS || null, STRATUM_HOST: process.env.STRATUM_HOST || null });
});

function sendTelegramError(res: express.Response, error: unknown): void {
  if (error instanceof TelegramConfigError) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  if (error instanceof TelegramApiError) {
    res.status(error.statusCode).json({ success: false, error: error.message });
    return;
  }

  console.error(
    'Telegram settings error:',
    error instanceof Error ? error.message : 'Unknown error'
  );
  res.status(500).json({ success: false, error: 'Telegram settings could not be updated' });
}

/**
 * Telegram notification proof of concept.
 *
 * The bot token and chat ID are stored only in CONFIG_DIR/telegram.json and
 * are never included in an API response.
 */
app.get('/api/telegram', async (_req, res) => {
  try {
    res.json(await telegramService.getSettings());
  } catch (error) {
    sendTelegramError(res, error);
  }
});

app.post('/api/telegram/connect', async (req, res) => {
  try {
    if (!isJsonObject(req.body) || typeof req.body.botToken !== 'string') {
      throw new TelegramConfigError('A Telegram bot token is required');
    }

    res.json(await telegramService.connectBot(req.body.botToken));
  } catch (error) {
    sendTelegramError(res, error);
  }
});

app.post('/api/telegram/pair', async (_req, res) => {
  try {
    res.json(await telegramService.pairChat());
  } catch (error) {
    sendTelegramError(res, error);
  }
});

app.patch('/api/telegram', async (req, res) => {
  try {
    if (!isJsonObject(req.body)) {
      throw new TelegramConfigError('Telegram settings must be a JSON object');
    }

    res.json(await telegramService.updateSettings(req.body as TelegramSettingsUpdate));
  } catch (error) {
    sendTelegramError(res, error);
  }
});

app.post('/api/telegram/test', async (_req, res) => {
  try {
    await telegramService.sendTestMessage();
    res.json({ success: true });
  } catch (error) {
    sendTelegramError(res, error);
  }
});

app.delete('/api/telegram', async (_req, res) => {
  try {
    res.json(await telegramService.disconnect());
  } catch (error) {
    sendTelegramError(res, error);
  }
});

/**
 * POST /api/validate/bitcoin-socket - Check if a Bitcoin Core IPC socket is listening
 */
app.post('/api/validate/bitcoin-socket', async (req, res) => {
  const { socket_path } = req.body;
  if (!socket_path || typeof socket_path !== 'string') {
    return res.status(400).json({ valid: false, error: 'socket_path is required' });
  }

  const resolved = expandHomePath(socket_path);
  const result = await probeBitcoinSocketWithDocker(resolved);
  return res.json(result);
});

/**
 * POST /api/validate/bitcoin-rpc - Auto-discover Bitcoin Core RPC nodes
 */
app.get('/api/validate/bitcoin-rpc', async (_req, res) => {
  const results = await autoDiscoverBitcoinRpc();
  return res.json(results);
});

async function getBitcoinSocketStartupError(data: SetupData): Promise<string | null> {
  if (data.mode !== 'jd' || !data.bitcoin) {
    return null;
  }

  const resolved = expandHomePath(data.bitcoin.socket_path);
  const result = await probeBitcoinSocketWithDocker(resolved);
  return result.valid ? null : result.error;
}

/**
 * PUT /api/config - Update configuration and restart with new values
 */
app.put('/api/config', async (req, res) => {
  if (!beginStackOperation('manual')) {
    return res.status(409).json(stackBusyResponse());
  }

  try {
    if (!isJsonObject(req.body)) {
      return res.status(400).json({ success: false, error: 'Configuration update must be a JSON object' });
    }

    const state = await loadState();

    if (!state.configured || !state.data) {
      return res.status(400).json({ success: false, error: 'No configuration to update' });
    }

    const updates = req.body as Partial<SetupData>;
    const currentData = state.data;
    const newData: SetupData = normalizeSetupData({
      ...currentData,
      ...updates,
      mode: updates.mode ?? currentData.mode,
      miningMode: updates.miningMode ?? currentData.miningMode,
      pool: updates.pool ?? currentData.pool,
      bitcoin: updates.bitcoin ?? currentData.bitcoin,
      jdc: updates.jdc ?? currentData.jdc,
      translator: updates.translator ?? currentData.translator,
    });

    const setupValidationError = getSetupValidationError(newData);
    if (setupValidationError) {
      return res.status(400).json({ success: false, error: setupValidationError });
    }

    const bitcoinCoreVersionError = getBitcoinCoreVersionError(newData);
    if (bitcoinCoreVersionError) {
      return res.status(400).json({ success: false, error: bitcoinCoreVersionError });
    }

    await ensureDockerAvailable();

    const bitcoinSocketError = await getBitcoinSocketStartupError(newData);
    if (bitcoinSocketError) {
      return res.status(400).json({ success: false, error: bitcoinSocketError });
    }

    await fs.mkdir(CONFIG_DIR, { recursive: true });

    const translatorPath = path.join(CONFIG_DIR, 'translator.toml');
    const jdcPath = path.join(CONFIG_DIR, 'jdc.toml');

    try {
      const translatorStat = await fs.stat(translatorPath);
      if (translatorStat.isDirectory()) {
        await fs.rm(translatorPath, { recursive: true });
      }
    } catch {
      // translatorPath doesn't exist or isn't a directory, ignore
    }

    try {
      const jdcStat = await fs.stat(jdcPath);
      if (jdcStat.isDirectory()) {
        await fs.rm(jdcPath, { recursive: true });
      }
    } catch {
      // jdcPath doesn't exist or isn't a directory, ignore
    }

    const translatorConfig = generateTranslatorConfig(newData);
    await fs.writeFile(translatorPath, translatorConfig);
    console.log('Updated translator.toml');

    if (newData.mode === 'jd') {
      const jdcConfig = generateJdcConfig(newData);
      if (jdcConfig) {
        await fs.writeFile(jdcPath, jdcConfig);
        console.log('Updated jdc.toml');
      }
    }

    await saveState(newData);

    await stopStack();

    await startStack(newData, CONFIG_DIR);

    const response: SetupResponse = { success: true };
    res.json(response);
  } catch (error) {
    console.error('Config update error:', error);
    const response: SetupResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update config',
    };
    res.status(500).json(response);
  } finally {
    finishStackOperation('manual');
  }
});

/**
 * GET /api/logs/diagnostics - Get collated log diagnostics for the deployed stack
 */
app.get('/api/logs/diagnostics', async (_req, res) => {
  try {
    const state = await loadState();
    const response = await getLogDiagnostics(state.mode, state.configured);
    res.json(response);
  } catch (error) {
    console.error('Log diagnostics error:', error);
    res.status(500).json({ error: 'Failed to get log diagnostics' });
  }
});

/**
 * GET /api/logs/raw - Get raw collated log lines for the deployed stack
 * Query params:
 *   ?tail=N  max lines per container (default 200, capped at 500)
 */
app.get('/api/logs/raw', async (req, res) => {
  try {
    const state = await loadState();
    const tailStr = req.query.tail as string;
    let lines: Awaited<ReturnType<typeof readCollatedLogLines>>;

    if (tailStr === 'all') {
      // Pull full history since container start by ignoring the per-container
      // tail cap applied inside readCollatedLogLines.
      lines = await readCollatedLogLines(state.mode, (container) =>
        readContainerLogs(container)
      );
    } else {
      const tailParam = parseInt(tailStr, 10);
      const tail = Number.isFinite(tailParam) ? Math.min(Math.max(tailParam, 1), 500) : 200;
      lines = await readCollatedLogLines(state.mode, (container, opts) =>
        readContainerLogs(container, { ...opts, tail })
      );
    }

    res.json({
      configured: state.configured,
      mode: state.mode,
      generatedAt: new Date().toISOString(),
      streams: getLogStreams(state.mode),
      lines,
    });
  } catch (error) {
    console.error('Raw logs error:', error);
    res.status(500).json({ error: 'Failed to get container logs' });
  }
});

/**
 * POST /api/setup - Configure and start the stack
 */
app.post('/api/setup', async (req, res) => {
  if (!beginStackOperation('manual')) {
    return res.status(409).json(stackBusyResponse());
  }

  try {
    if (!isJsonObject(req.body)) {
      return res.status(400).json({ success: false, error: 'Setup configuration must be a JSON object' });
    }

    const data = normalizeSetupData(req.body as unknown as SetupData);

    // Validate required fields
    const setupValidationError = getSetupValidationError(data);
    if (setupValidationError) {
      return res.status(400).json({ success: false, error: setupValidationError });
    }

    const bitcoinCoreVersionError = getBitcoinCoreVersionError(data);
    if (bitcoinCoreVersionError) {
      return res.status(400).json({ success: false, error: bitcoinCoreVersionError });
    }

    await ensureDockerAvailable();

    const bitcoinSocketError = await getBitcoinSocketStartupError(data);
    if (bitcoinSocketError) {
      return res.status(400).json({ success: false, error: bitcoinSocketError });
    }

    // Generate config files
    await fs.mkdir(CONFIG_DIR, { recursive: true });

    const translatorPath = path.join(CONFIG_DIR, 'translator.toml');
    const jdcPath = path.join(CONFIG_DIR, 'jdc.toml');

    // Remove if exists as directory (can happen from Docker volume mounts)
    try {
      const translatorStat = await fs.stat(translatorPath);
      if (translatorStat.isDirectory()) {
        await fs.rm(translatorPath, { recursive: true });
      }
    } catch {
      // Doesn't exist, fine
    }
    try {
      const jdcStat = await fs.stat(jdcPath);
      if (jdcStat.isDirectory()) {
        await fs.rm(jdcPath, { recursive: true });
      }
    } catch {
      // Doesn't exist, fine
    }

    const translatorConfig = generateTranslatorConfig(data);
    await fs.writeFile(translatorPath, translatorConfig);
    console.log('Generated translator.toml');

    if (data.mode === 'jd') {
      const jdcConfig = generateJdcConfig(data);
      if (jdcConfig) {
        await fs.writeFile(jdcPath, jdcConfig);
        console.log('Generated jdc.toml');
      }
    }

    // Save state
    await saveState(data);

    // Stop any running containers first (graceful shutdown order matters:
    // JDC must be stopped before Translator to avoid crashing Bitcoin Core).
    // This is critical when switching from JD mode to solo mining — without
    // this, the old JDC container would be left running and crash when the
    // Translator is replaced underneath it.
    await stopStack();

    // Start the stack
    await startStack(data, CONFIG_DIR);

    const response: SetupResponse = { success: true };
    res.json(response);
  } catch (error) {
    console.error('Setup error:', error);
    const response: SetupResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    res.status(500).json(response);
  } finally {
    finishStackOperation('manual');
  }
});

/**
 * POST /api/stop - Stop the stack
 */
app.post('/api/stop', async (_req, res) => {
  if (!beginStackOperation('manual')) {
    return res.status(409).json(stackBusyResponse());
  }

  try {
    const state = await loadState();
    if (state.configured && state.data) await saveState(state.data, false);

    await stopStack();
    res.json({ success: true });
  } catch (error) {
    console.error('Stop error:', error);
    res.status(500).json({ success: false, error: 'Failed to stop stack' });
  } finally {
    finishStackOperation('manual');
  }
});

/**
 * POST /api/restart - Restart the stack
 */
app.post('/api/restart', async (_req, res) => {
  if (!beginStackOperation('manual')) {
    return res.status(409).json(stackBusyResponse());
  }

  try {
    const state = await loadState();
    if (!state.configured || !state.data) {
      return res.status(400).json({ success: false, error: 'Not configured' });
    }

    const data = normalizeSetupData(state.data);

    const setupValidationError = getSetupValidationError(data);
    if (setupValidationError) {
      return res.status(400).json({ success: false, error: setupValidationError });
    }

    const bitcoinCoreVersionError = getBitcoinCoreVersionError(data);
    if (bitcoinCoreVersionError) {
      return res.status(400).json({ success: false, error: bitcoinCoreVersionError });
    }

    await ensureDockerAvailable();

    const bitcoinSocketError = await getBitcoinSocketStartupError(data);
    if (bitcoinSocketError) {
      return res.status(400).json({ success: false, error: bitcoinSocketError });
    }

    await saveState(data, true);

    await stopStack();
    await startStack(data, CONFIG_DIR);

    res.json({ success: true });
  } catch (error) {
    console.error('Restart error:', error);
    res.status(500).json({ success: false, error: 'Failed to restart stack' });
  } finally {
    finishStackOperation('manual');
  }
});

/**
 * POST /api/reset - Reset configuration (stop containers and delete config)
 */
app.post('/api/reset', async (_req, res) => {
  if (!beginStackOperation('manual')) {
    return res.status(409).json(stackBusyResponse());
  }

  try {
    // Stop containers first
    await stopStack();

    // Delete state file
    try {
      await fs.unlink(STATE_FILE);
    } catch {
      // File might not exist, that's fine
    }

    // Delete config files
    try {
      await fs.unlink(path.join(CONFIG_DIR, 'translator.toml'));
      await fs.unlink(path.join(CONFIG_DIR, 'jdc.toml'));
    } catch {
      // Files might not exist
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json({ success: false, error: 'Failed to reset configuration' });
  } finally {
    finishStackOperation('manual');
  }
});

/**
 * Get the URL for connecting to a container's API.
 * Uses container name on sv2-network (Docker) or localhost (development).
 */
function getContainerUrl(containerName: string, port: number): string {
  // In Docker, containers are on sv2-network and can be reached by name
  // In development, containers expose ports on localhost
  // Try container name first (works when sv2-ui is on sv2-network)
  // The container name is the hostname on the Docker network
  return process.env.NODE_ENV === 'production'
    ? `http://${containerName}:${port}`
    : `http://localhost:${port}`;
}

type MonitoringGlobal = {
  server?: { total_hashrate: number } | null;
  sv1_clients?: { total_clients: number; total_hashrate: number } | null;
  sv2_clients?: {
    total_clients: number;
    total_channels: number;
    total_hashrate: number;
  } | null;
};

type MonitoringServerChannel = {
  channel_id: number;
  user_identity: string;
  best_diff: number;
  blocks_found: number;
  shares_submitted: number;
  shares_acknowledged: number;
  shares_rejected: number;
};

type MonitoringChannelsPage<T> = {
  total_extended: number;
  total_standard: number;
  extended_channels: T[];
  standard_channels: T[];
};

type MonitoringClient = {
  client_id: number;
};

type MonitoringItemsPage<T> = {
  total: number;
  items: T[];
};

type TaggedMonitoringChannel<T> = {
  kind: 'extended' | 'standard';
  channel: T;
};

type MonitoringMiningChannel = {
  channel_id: number;
  user_identity: string;
  best_diff: number;
  blocks_found: number;
};

async function fetchMonitoringJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? await response.json() as T : null;
  } catch {
    return null;
  }
}

function combineMonitoringChannelPage<T>(
  page: MonitoringChannelsPage<T>,
): {
  items: TaggedMonitoringChannel<T>[];
  total: number;
} {
  return {
    items: [
      ...page.extended_channels.map((channel) => ({
        kind: 'extended' as const,
        channel,
      })),
      ...page.standard_channels.map((channel) => ({
        kind: 'standard' as const,
        channel,
      })),
    ],
    total: Math.max(page.total_extended, page.total_standard),
  };
}

async function fetchAllMonitoringChannels<T>(
  endpoint: string,
): Promise<TaggedMonitoringChannel<T>[] | null> {
  return collectPaginatedMonitoringItems(async (offset, limit) => {
    const page = await fetchMonitoringJson<MonitoringChannelsPage<T>>(
      `${endpoint}?offset=${offset}&limit=${limit}`
    );
    return page ? combineMonitoringChannelPage(page) : null;
  });
}

async function fetchAllMonitoringItems<T>(endpoint: string): Promise<T[] | null> {
  return collectPaginatedMonitoringItems(async (offset, limit) => {
    const page = await fetchMonitoringJson<MonitoringItemsPage<T>>(
      `${endpoint}?offset=${offset}&limit=${limit}`
    );
    return page ? { items: page.items, total: page.total } : null;
  });
}

async function getTelegramActivitySnapshot(): Promise<TelegramActivitySnapshot> {
  const status = await getCurrentStatus();

  if (!status.running || !status.mode) {
    return {
      running: false,
      poolName: status.poolName,
      activePoolIndex: status.activePoolIndex,
      hashrate: null,
      workers: null,
      sharesSubmitted: null,
      sharesAccepted: null,
      sharesRejected: null,
      channels: null,
    };
  }

  const isJdMode = status.mode === 'jd';
  const containerName = isJdMode ? 'sv2-jdc' : 'sv2-translator';
  const port = isJdMode ? JDC_MONITORING_PORT : TRANSLATOR_MONITORING_PORT;
  const baseUrl = `${getContainerUrl(containerName, port)}/api/v1`;
  const [global, serverChannels, monitoringClients] = await Promise.all([
    fetchMonitoringJson<MonitoringGlobal>(`${baseUrl}/global`),
    fetchAllMonitoringChannels<MonitoringServerChannel>(`${baseUrl}/server/channels`),
    isJdMode
      ? fetchAllMonitoringItems<MonitoringClient>(`${baseUrl}/clients`)
      : Promise.resolve(null),
  ]);

  const clients = isJdMode ? global?.sv2_clients : global?.sv1_clients;
  let miningChannels: TelegramMiningChannel[] | null = null;

  if (isJdMode && monitoringClients) {
    const downstreamResponses = await Promise.all(
      monitoringClients.map(async (client) => ({
        clientId: client.client_id,
        channels: await fetchAllMonitoringChannels<MonitoringMiningChannel>(
          `${baseUrl}/clients/${client.client_id}/channels`
        ),
      }))
    );

    if (downstreamResponses.every((response) => response.channels !== null)) {
      miningChannels = downstreamResponses.flatMap(({ clientId, channels }) => {
        if (!channels) return [];
        return channels.map(({ kind, channel }) => ({
          key: `jdc:${clientId}:${kind}:${channel.channel_id}:${channel.user_identity}`,
          userIdentity: channel.user_identity,
          blocksFound: channel.blocks_found,
          bestDifficulty: channel.best_diff,
        }));
      });
    }
  } else if (!isJdMode && serverChannels) {
    miningChannels = serverChannels.map(({ kind, channel }) => ({
      key: `translator:server:${kind}:${channel.channel_id}:${channel.user_identity}`,
      userIdentity: channel.user_identity,
      blocksFound: channel.blocks_found,
      bestDifficulty: channel.best_diff,
    }));
  }

  return {
    running: true,
    poolName: status.poolName,
    activePoolIndex: status.activePoolIndex,
    hashrate: clients?.total_hashrate ?? global?.server?.total_hashrate ?? null,
    workers: getTelegramWorkerCount(
      isJdMode,
      global?.sv1_clients,
      global?.sv2_clients,
    ),
    sharesSubmitted: serverChannels
      ? serverChannels.reduce((sum, item) => sum + item.channel.shares_submitted, 0)
      : null,
    sharesAccepted: serverChannels
      ? serverChannels.reduce((sum, item) => sum + item.channel.shares_acknowledged, 0)
      : null,
    sharesRejected: serverChannels
      ? serverChannels.reduce((sum, item) => sum + item.channel.shares_rejected, 0)
      : null,
    channels: miningChannels,
  };
}

/**
 * Proxy requests to Translator monitoring API
 * This avoids CORS issues when the frontend is served from a different port
 * /translator-api/v1/global -> http://sv2-translator:9092/api/v1/global
 */
app.use('/translator-api', async (req, res) => {
  const targetUrl = `${getContainerUrl('sv2-translator', TRANSLATOR_MONITORING_PORT)}/api${req.url}`;
  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.text();
    res.status(response.status).set('Content-Type', response.headers.get('Content-Type') || 'application/json').send(data);
  } catch {
    res.status(502).json({ error: 'Cannot connect to Translator monitoring API' });
  }
});

/**
 * Proxy requests to JDC monitoring API
 * /jdc-api/v1/global -> http://sv2-jdc:9091/api/v1/global
 */
app.use('/jdc-api', async (req, res) => {
  const targetUrl = `${getContainerUrl('sv2-jdc', JDC_MONITORING_PORT)}/api${req.url}`;
  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.text();
    res.status(response.status).set('Content-Type', response.headers.get('Content-Type') || 'application/json').send(data);
  } catch {
    res.status(502).json({ error: 'Cannot connect to JDC monitoring API' });
  }
});

/**
 * SPA fallback - serve index.html for client-side routing
 */
app.get('*', (_req, res) => {
  res.sendFile(path.join(UI_DIR, 'index.html'));
});

async function reconcileShouldBeRunning(): Promise<void> {
  if (!beginStackOperation('auto-start')) return;

  try {
    const state = await loadState();
    if (!state.configured || !state.data || !state.shouldBeRunning) return;

    const containers = await getStackStatus(state.mode);
    if (isStackRunning(state.mode, containers)) return;

    console.log('Auto-start: shouldBeRunning=true and stack is stopped. Starting containers...');

    const versionError = getBitcoinCoreVersionError(state.data);
    if (versionError) {
      console.error('Auto-start blocked:', versionError);
      return;
    }

    if (state.data.mode === 'jd') {
      const socketError = await getBitcoinSocketStartupError(state.data);
      if (socketError) {
        console.error('Auto-start blocked:', socketError);
        return;
      }
    }

    await startStack(state.data, CONFIG_DIR);
    console.log('Auto-start: containers started successfully');
  } catch (error) {
    console.error('Auto-start failed:', error);
  } finally {
    finishStackOperation('auto-start');
  }
}

async function pollTelegramNotifications(): Promise<void> {
  try {
    await telegramService.poll(getTelegramActivitySnapshot);
  } catch (error) {
    console.warn(
      'Telegram notification check failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

app.listen(PORT, () => {
  const dockerConnection = getDockerConnectionInfo();

  console.log(`sv2-ui server running on http://localhost:${PORT}`);
  console.log(`Config directory: ${CONFIG_DIR}`);
  console.log(`Docker: ${dockerConnection.endpoint} (${dockerConnection.source})`);

  if (process.env.NODE_ENV === 'production') {
    console.log('');
    console.log('┌─────────────────────────────────────────────────────┐');
    console.log('│                                                     │');
    console.log('│   ⛏️  SV2 UI is ready!                               │');
    console.log('│                                                     │');
    console.log(`│   Open in browser: http://localhost:${PORT}             │`);
    console.log('│                                                     │');
    console.log('└─────────────────────────────────────────────────────┘');
    console.log('');
  }

  // Keep configured mining services running across app/system restarts.
  void reconcileShouldBeRunning();
  setInterval(() => {
    void reconcileShouldBeRunning();
  }, AUTO_START_RETRY_INTERVAL_MS);

  // Telegram notifications run in the local backend, so they keep working
  // while the browser UI is closed.
  void pollTelegramNotifications();
  telegramMonitorTimer = setInterval(() => {
    void pollTelegramNotifications();
  }, TELEGRAM_POLL_INTERVAL_MS);
});

// Graceful shutdown: stop mining containers when sv2-ui exits
let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  if (telegramMonitorTimer) {
    clearInterval(telegramMonitorTimer);
    telegramMonitorTimer = null;
  }

  console.log(`\n${signal} received. Stopping mining containers...`);
  try {
    await stopStack();
    console.log('Mining containers stopped.');
  } catch {
    // Docker may not be available, that's fine
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
