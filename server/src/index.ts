/**
 * sv2-ui Backend Server
 * 
 * Handles Docker orchestration for the SV2 mining stack.
 */

import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

import type { PoolConfig, SetupData, StatusResponse, SetupResponse } from './types.js';
import { normalizeSetupData } from './config-generator.js';
import { ensureConfigDir } from './config-dir.js';
import {
  getServiceConfigDrift,
  getSetupValidationError,
  prepareServiceConfig,
  reconcileServiceConfigFiles,
  type PreparedServiceConfig,
} from './service-config.js';
import { DockerConnectionError } from './docker-errors.js';
import {
  TRANSLATOR_MONITORING_PORT,
  JDC_MONITORING_PORT,
} from '@sv2-ui/shared';
import {
  loadSavedState,
  saveSavedState,
  type SavedState,
  SavedStateError,
} from './state.js';
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
import {
  CredentialError,
  generateRecoveryKey,
  getPasswordValidationError,
  hashPassword,
  loadCredential,
  saveCredential,
  verifyPassword,
  verifyRecoveryKey,
} from './auth-store.js';
import { isSameOriginRequest } from './request-origin.js';
import {
  SessionStore,
  SESSION_COOKIE_NAME,
  buildClearedSessionCookie,
  buildSessionCookie,
  parseCookies,
} from './sessions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('case sensitive routing', true);

// WARNING: Umbrel's app_proxy (and any reverse proxy) terminates the client connection;
// trust its forwarding headers so cookie Secure flags are decided correctly.
app.set('trust proxy', true);
const PORT = process.env.PORT || 3001;

// Config storage
const CONFIG_DIR = process.env.CONFIG_DIR || path.join(__dirname, '../../data/config');
const STATE_FILE = path.join(CONFIG_DIR, 'state.json');
const CREDENTIAL_FILE = path.join(CONFIG_DIR, 'credential.json');
const sessions = new SessionStore();

const AUTO_START_RETRY_INTERVAL_MS = 30_000;
const AUTO_START_MIN_BACKOFF_MS = 60_000;
const AUTO_START_MAX_BACKOFF_MS = 5 * 60_000;

type StackBusyReason = 'auto-start' | 'manual';

let stackBusyReason: StackBusyReason | null = null;
let autoStartFailureCount = 0;
let nextAutoStartAttemptAt = 0;
let autoStartSetupReviewLogged = false;
const activePoolTracker = new ActivePoolTracker(readContainerLogs);

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

app.use(express.json());

/**
 * WARNING: Public API surface. Everything else under /api requires a session.
 * These endpoints expose no configuration and no host details.
 */
const PUBLIC_API_PATHS = new Set([
  '/api/health',
  '/api/auth/state',
  '/api/auth/login',
  '/api/auth/setup-password',
  '/api/auth/recover',
]);

const RATE_MAX_FAILURES = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;

const loginAttempts = { count: 0, resetAt: 0 };
const recoverAttempts = { count: 0, resetAt: 0 };

function isRateLimited(attempts: { count: number; resetAt: number }): boolean {
  if (attempts.count === 0) return false;
  if (Date.now() > attempts.resetAt) {
    attempts.count = 0;
    return false;
  }
  return attempts.count >= RATE_MAX_FAILURES;
}

function recordFailure(attempts: { count: number; resetAt: number }): void {
  const now = Date.now();
  if (attempts.count === 0 || now > attempts.resetAt) {
    attempts.count = 1;
    attempts.resetAt = now + RATE_WINDOW_MS;
  } else {
    attempts.count += 1;
  }
}

function isSecureRequest(req: express.Request): boolean {
  return req.protocol === 'https' || req.get('x-forwarded-proto') === 'https';
}

function getSessionToken(req: express.Request): string | undefined {
  return parseCookies(req.get('cookie'))[SESSION_COOKIE_NAME];
}

// Reject cross-site state-changing requests before any handler runs.
app.use((req, res, next) => {
  const allowed = isSameOriginRequest({
    method: req.method,
    origin: req.get('origin'),
    host: req.get('host'),
    secFetchSite: req.get('sec-fetch-site'),
  });
  if (!allowed) {
    return res.status(403).json({ error: 'Cross-origin request rejected' });
  }
  next();
});

app.use((req, res, next) => {
  const isProtected =
    (req.path.startsWith('/api/') && !PUBLIC_API_PATHS.has(req.path)) ||
    req.path.startsWith('/translator-api') ||
    req.path.startsWith('/jdc-api');

  if (!isProtected) return next();
  if (sessions.isValid(getSessionToken(req))) return next();

  return res.status(401).json({ error: 'Authentication required' });
});

// Serve static files from the built UI
// In Docker (NODE_ENV=production): /app/public
// In development: ../../dist (relative to server/dist/)
const UI_DIR = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, '../public')
  : path.join(__dirname, '../../dist');
app.use(express.static(UI_DIR));

async function loadState(): Promise<SavedState> {
  return loadSavedState(STATE_FILE);
}

async function saveState(data: SetupData, shouldBeRunning = true): Promise<void> {
  return saveSavedState(STATE_FILE, data, shouldBeRunning);
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

/**
 * Stop the stack, reconcile generated service configuration from saved setup
 * data, persist that data, then start the stack. Every user-initiated start
 * path goes through this function so updates cannot retain stale TOML files.
 */
async function reconcileAndStartStack(prepared: Extract<PreparedServiceConfig, { kind: 'ready' }>): Promise<void> {
  // Preparation happens before disrupting an active stack. If saved input
  // needs review, callers return that guidance without causing downtime.
  await stopStack();

  const changedFiles = await reconcileServiceConfigFiles(prepared.files, CONFIG_DIR);
  if (changedFiles.length > 0) {
    console.log(`Reconciled generated configuration: ${changedFiles.join(', ')}`);
  }

  await saveState(prepared.data, true);
  await startStack(prepared.data, CONFIG_DIR);
  resetAutoStartRecoveryState();
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

function resetAutoStartBackoff(): void {
  autoStartFailureCount = 0;
  nextAutoStartAttemptAt = 0;
}

function resetAutoStartRecoveryState(): void {
  resetAutoStartBackoff();
  autoStartSetupReviewLogged = false;
}

function recordAutoStartFailure(error: unknown): void {
  autoStartFailureCount += 1;
  const delayMs = Math.min(
    AUTO_START_MIN_BACKOFF_MS * 2 ** (autoStartFailureCount - 1),
    AUTO_START_MAX_BACKOFF_MS,
  );
  nextAutoStartAttemptAt = Date.now() + delayMs;

  console.error('Auto-start failed:', error);
  console.log(`Auto-start: retrying in ${Math.round(delayMs / 1000)}s.`);
}

/**
 * GET /api/auth/state - Whether a password exists and whether this client is
 * authenticated. Deliberately leaks nothing beyond those two booleans.
 */
app.get('/api/auth/state', async (req, res) => {
  try {
    const credential = await loadCredential(CREDENTIAL_FILE);
    res.json({
      passwordSet: credential !== null,
      authenticated: sessions.isValid(getSessionToken(req)),
      recoveryKeySet: credential?.recoveryKey !== undefined,
    });
  } catch (error) {
    if (error instanceof CredentialError) {
      return res.status(500).json({ error: 'Stored credential could not be read.' });
    }
    console.error('Auth state error:', error);
    res.status(500).json({ error: 'Failed to read authentication state' });
  }
});

/**
 * POST /api/auth/setup-password - Create the admin password.
 * Only permitted while no password exists; afterwards it always 409s so it
 * cannot be used to take over a configured instance.
 */
app.post('/api/auth/setup-password', async (req, res) => {
  try {
    const existing = await loadCredential(CREDENTIAL_FILE);
    if (existing) {
      return res.status(409).json({ error: 'A password has already been set.' });
    }

    const password = isJsonObject(req.body) ? req.body.password : undefined;
    const validationError = getPasswordValidationError(password);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    await ensureConfigDir(CONFIG_DIR);
    const recoveryKey = generateRecoveryKey();
    await saveCredential(CREDENTIAL_FILE, {
      ...(await hashPassword(password as string)),
      recoveryKey: await hashPassword(recoveryKey),
    });

    const token = sessions.create();
    res.setHeader('Set-Cookie', buildSessionCookie(token, isSecureRequest(req)));
    // The recovery key is returned exactly once; the operator must save it.
    res.json({ success: true, recoveryKey });
  } catch (error) {
    console.error('Password setup error:', error);
    res.status(500).json({ error: 'Failed to set password' });
  }
});

/**
 * POST /api/auth/login - Exchange the password for a session cookie.
 */
app.post('/api/auth/login', async (req, res) => {
  if (isRateLimited(loginAttempts)) {
    res.setHeader('Retry-After', String(Math.ceil(RATE_WINDOW_MS / 1000)));
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }

  try {
    const credential = await loadCredential(CREDENTIAL_FILE);
    if (!credential) {
      return res.status(409).json({ error: 'No password has been set yet.' });
    }

    const password = isJsonObject(req.body) ? req.body.password : undefined;
    if (typeof password !== 'string' || !(await verifyPassword(password, credential))) {
      recordFailure(loginAttempts);
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    const token = sessions.create();
    res.setHeader('Set-Cookie', buildSessionCookie(token, isSecureRequest(req)));
    res.json({ success: true });
  } catch (error) {
    if (error instanceof CredentialError) {
      return res.status(500).json({ error: 'Stored credential could not be read.' });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

/**
 * POST /api/auth/logout - Invalidate the current session.
 */
app.post('/api/auth/logout', (req, res) => {
  sessions.destroy(getSessionToken(req));
  res.setHeader('Set-Cookie', buildClearedSessionCookie(isSecureRequest(req)));
  res.json({ success: true });
});

/**
 * POST /api/auth/recover - Reset a forgotten password using the recovery key
 * and immediately set a new one. This is atomic: the recovery key is verified
 * and the new credential is written in one step so there is no window where
 * the instance sits credentialless and claimable by a stranger.
 *
 * Unauthenticated by necessity (the operator is locked out), but still behind
 * the same-origin guard and rate-limited. The mining configuration is
 * preserved; only the credential file is rewritten.
 */
app.post('/api/auth/recover', async (req, res) => {
  if (isRateLimited(recoverAttempts)) {
    res.setHeader('Retry-After', String(Math.ceil(RATE_WINDOW_MS / 1000)));
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }

  try {
    const recoveryKey = isJsonObject(req.body) ? req.body.recoveryKey : undefined;
    if (typeof recoveryKey !== 'string' || recoveryKey.length === 0) {
      return res.status(400).json({ error: 'A recovery key is required.' });
    }

    const newPassword = isJsonObject(req.body) ? req.body.newPassword : undefined;
    const passwordError = getPasswordValidationError(newPassword);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const credential = await loadCredential(CREDENTIAL_FILE);
    if (!credential) {
      return res.status(409).json({ error: 'No password has been set yet.' });
    }

    if (!(await verifyRecoveryKey(recoveryKey, credential))) {
      recordFailure(recoverAttempts);
      return res.status(401).json({ error: 'Invalid recovery key.' });
    }

    const newRecoveryKey = generateRecoveryKey();
    await saveCredential(CREDENTIAL_FILE, {
      ...(await hashPassword(newPassword as string)),
      recoveryKey: await hashPassword(newRecoveryKey),
    });
    sessions.destroyAll();
    recoverAttempts.count = 0;
    res.json({ success: true, recoveryKey: newRecoveryKey });
  } catch (error) {
    console.error('Recovery error:', error);
    res.status(500).json({ error: 'Failed to recover account' });
  }
});

/**
 * POST /api/auth/recovery-key/regenerate - Issue a new recovery key
 * (authenticated). The prior key is invalidated. The new key is returned once.
 */
app.post('/api/auth/recovery-key/regenerate', async (_req, res) => {
  try {
    const credential = await loadCredential(CREDENTIAL_FILE);
    if (!credential) {
      return res.status(409).json({ error: 'No password has been set yet.' });
    }

    const recoveryKey = generateRecoveryKey();
    await saveCredential(CREDENTIAL_FILE, {
      ...credential,
      recoveryKey: await hashPassword(recoveryKey),
    });
    res.json({ recoveryKey });
  } catch (error) {
    if (error instanceof CredentialError) {
      return res.status(500).json({ error: 'Stored credential could not be read.' });
    }
    console.error('Regenerate recovery key error:', error);
    res.status(500).json({ error: 'Failed to regenerate recovery key' });
  }
});

/**
 * POST /api/auth/change-password - Change the admin password (authenticated).
 * Requires the current password and a new password that meets the minimum
 * length requirement. The recovery key is preserved.
 */
app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    const credential = await loadCredential(CREDENTIAL_FILE);
    if (!credential) {
      return res.status(409).json({ error: 'No password has been set yet.' });
    }

    if (typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, credential))) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    if (typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'A new password is required.' });
    }

    const validationError = getPasswordValidationError(newPassword);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const updatedCredential = await hashPassword(newPassword);
    await saveCredential(CREDENTIAL_FILE, {
      ...updatedCredential,
      recoveryKey: credential.recoveryKey,
    });

    res.json({ success: true });
  } catch (error) {
    if (error instanceof CredentialError) {
      return res.status(500).json({ error: 'Stored credential could not be read.' });
    }
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

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
    const state = await loadState();
    let containers: StatusResponse['containers'] = { translator: null, jdc: null };
    let dockerError: string | null = null;
    try {
      containers = await getStackStatus(state.mode);
    } catch (error) {
      if (error instanceof DockerConnectionError) {
        dockerError = error.message;
      } else {
        // Not a connectivity problem. Treat as not running rather than a 500,
        // which the client reads as "no backend".
        console.error('Status: container inspect failed:', error);
      }
    }
    const running = isStackRunning(state.mode, containers);
    const prepared = state.configured ? prepareServiceConfig(state.data) : null;
    const configurationIssues = prepared?.kind === 'needs-setup-review'
      ? prepared.issues
      : [];
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

    const response: StatusResponse = {
      configured: state.configured,
      running,
      dockerError,
      autoStarting: stackBusyReason === 'auto-start',
      shouldBeRunning: state.shouldBeRunning,
      miningMode: state.miningMode,
      mode: state.mode,
      poolName: isSovereignSolo
        ? 'Sovereign Solo Mining'
        : (activePool?.name ?? null),
      activePoolIndex: activePool?.index ?? null,
      activePoolAddress: activePool ? pools[activePool.index]?.address ?? null : null,
      activePoolPort: activePool ? pools[activePool.index]?.port ?? null : null,
      activePoolAuthorityPublicKey: activePool ? pools[activePool.index]?.authority_public_key ?? null : null,
      configurationIssues,
      containers,
    };

    res.json(response);
  } catch (error) {
    if (error instanceof SavedStateError) {
      console.error('Saved setup error:', error.message);
      const response: StatusResponse = {
        // Treat unreadable saved data as configured to prevent the UI from
        // redirecting to a blank setup that could overwrite it.
        configured: true,
        running: false,
        dockerError: null,
        autoStarting: false,
        shouldBeRunning: false,
        miningMode: null,
        mode: null,
        poolName: null,
        activePoolIndex: null,
        activePoolAddress: null,
        activePoolPort: null,
        activePoolAuthorityPublicKey: null,
        configurationIssues: [{
          code: 'saved-setup-unavailable',
          title: 'Your saved setup needs attention',
          message: 'Your saved setup could not be read. It may be incomplete or corrupted, so it has not been changed. Reset setup to start over, or restore a backup.',
        }],
        containers: { translator: null, jdc: null },
      };
      return res.json(response);
    }
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
    if (error instanceof SavedStateError) {
      return res.status(409).json({
        error: 'Saved setup could not be read. It has not been changed.',
      });
    }
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

    const prepared = prepareServiceConfig(newData, { logFailure: true });
    if (prepared.kind !== 'ready') {
      return res.status(400).json({
        success: false,
        error: prepared.issues[0]?.message ?? 'Review your setup before starting mining.',
      });
    }

    await ensureDockerAvailable();

    const bitcoinSocketError = await getBitcoinSocketStartupError(prepared.data);
    if (bitcoinSocketError) {
      return res.status(400).json({ success: false, error: bitcoinSocketError });
    }

    await reconcileAndStartStack(prepared);

    const response: SetupResponse = { success: true };
    res.json(response);
  } catch (error) {
    if (error instanceof SavedStateError) {
      return res.status(409).json({ success: false, error: 'Saved setup could not be read. It has not been changed.' });
    }
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

    // Never allow a new setup submission to silently replace unreadable saved
    // data. Reset is an explicit, intentional recovery action.
    await loadState();

    const data = normalizeSetupData(req.body as unknown as SetupData);

    const setupValidationError = getSetupValidationError(data);
    if (setupValidationError) {
      return res.status(400).json({ success: false, error: setupValidationError });
    }

    const prepared = prepareServiceConfig(data, { logFailure: true });
    if (prepared.kind !== 'ready') {
      return res.status(400).json({
        success: false,
        error: prepared.issues[0]?.message ?? 'Review your setup before starting mining.',
      });
    }

    await ensureDockerAvailable();

    const bitcoinSocketError = await getBitcoinSocketStartupError(prepared.data);
    if (bitcoinSocketError) {
      return res.status(400).json({ success: false, error: bitcoinSocketError });
    }

    await reconcileAndStartStack(prepared);

    const response: SetupResponse = { success: true };
    res.json(response);
  } catch (error) {
    if (error instanceof SavedStateError) {
      return res.status(409).json({ success: false, error: 'Saved setup could not be read. It has not been changed.' });
    }
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
    try {
      const state = await loadState();
      if (state.configured && state.data) await saveState(state.data, false);
    } catch (error) {
      if (!(error instanceof SavedStateError)) throw error;
      console.error('Saved setup error while stopping services:', error.message);
    }

    await stopStack();
    res.json({ success: true });
  } catch (error) {
    console.error('Stop error:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to stop stack' });
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

    const prepared = prepareServiceConfig(data, { logFailure: true });
    if (prepared.kind !== 'ready') {
      return res.status(400).json({
        success: false,
        error: prepared.issues[0]?.message ?? 'Review your setup before starting mining.',
      });
    }

    await ensureDockerAvailable();

    const bitcoinSocketError = await getBitcoinSocketStartupError(prepared.data);
    if (bitcoinSocketError) {
      return res.status(400).json({ success: false, error: bitcoinSocketError });
    }

    await reconcileAndStartStack(prepared);

    res.json({ success: true });
  } catch (error) {
    if (error instanceof SavedStateError) {
      return res.status(409).json({ success: false, error: 'Saved setup could not be read. It has not been changed.' });
    }
    console.error('Restart error:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to restart stack' });
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
    // Reset is the explicit recovery action, including for unreadable setup.
    await Promise.all([
      fs.rm(STATE_FILE, { recursive: true, force: true }),
      fs.rm(CREDENTIAL_FILE, { recursive: true, force: true }),
      fs.rm(path.join(CONFIG_DIR, 'translator.toml'), { recursive: true, force: true }),
      fs.rm(path.join(CONFIG_DIR, 'jdc.toml'), { recursive: true, force: true }),
    ]);

    // The credential is gone, so every existing session is now unbacked.
    sessions.destroyAll();

    res.json({ success: true });
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to reset configuration' });
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
  if (nextAutoStartAttemptAt > Date.now()) return;
  if (!beginStackOperation('auto-start')) return;

  try {
    const state = await loadState();
    if (!state.configured || !state.data || !state.shouldBeRunning) {
      resetAutoStartRecoveryState();
      return;
    }

    const containers = await getStackStatus(state.mode);
    const prepared = prepareServiceConfig(state.data, { logFailure: !autoStartSetupReviewLogged });
    const running = isStackRunning(state.mode, containers);

    if (prepared.kind !== 'ready') {
      autoStartSetupReviewLogged = true;
      // A required setup choice is missing. Stop stale services and let the
      // wizard reopen with saved fields prefilled.
      if (running) {
        console.log('Auto-start: setup review is required. Stopping the existing stack.');
        await stopStack();
      }
      resetAutoStartBackoff();
      return;
    }
    autoStartSetupReviewLogged = false;

    // Check drift before considering a running stack healthy. This repairs an
    // interrupted update and applies new generated configuration on boot.
    const drift = await getServiceConfigDrift(prepared.files, CONFIG_DIR);
    if (running && drift.length === 0) {
      resetAutoStartRecoveryState();
      return;
    }

    if (prepared.data.mode === 'jd') {
      const socketError = await getBitcoinSocketStartupError(prepared.data);
      if (socketError) {
        recordAutoStartFailure(socketError);
        return;
      }
    }

    if (running) {
      console.log(`Auto-start: generated configuration changed (${drift.join(', ')}). Restarting containers...`);
    } else {
      console.log('Auto-start: shouldBeRunning=true and stack is stopped. Starting containers...');
    }

    await stopStack();
    const changedFiles = await reconcileServiceConfigFiles(prepared.files, CONFIG_DIR);
    if (changedFiles.length > 0) {
      console.log(`Auto-start reconciled generated configuration: ${changedFiles.join(', ')}`);
    }

    await saveState(prepared.data, true);
    await startStack(prepared.data, CONFIG_DIR);
    resetAutoStartRecoveryState();
    console.log('Auto-start: containers started successfully');
  } catch (error) {
    recordAutoStartFailure(error);
  } finally {
    finishStackOperation('auto-start');
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
});

// Graceful shutdown: stop mining containers when sv2-ui exits
let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

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
