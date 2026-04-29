/**
 * sv2-ui Backend Server
 * 
 * Handles Docker orchestration for the SV2 mining stack.
 */

import express from 'express';
import cors from 'cors';
import net from 'net';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

import type { SetupData, StatusResponse, SetupResponse } from './types.js';
import { generateTranslatorConfig, generateJdcConfig, normalizeSetupData } from './config-generator.js';
import {
  startStack,
  stopStack,
  getStackStatus,
  isDockerAvailable,
  ensureDockerAvailable,
  getDockerConnectionInfo,
  expandHomePath,
  readContainerLogs
} from './docker.js';
import { getLogDiagnostics, getLogStreams, readCollatedLogLines } from './logs/diagnostics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Config storage
const CONFIG_DIR = process.env.CONFIG_DIR || path.join(__dirname, '../../data/config');
const STATE_FILE = path.join(CONFIG_DIR, 'state.json');

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
async function loadState(): Promise<{ configured: boolean; miningMode: 'solo' | 'pool' | null; mode: 'jd' | 'no-jd' | null; data: SetupData | null }> {
  try {
    const content = await fs.readFile(STATE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { configured: false, miningMode: null, mode: null, data: null };
  }
}

/**
 * Save state
 */
async function saveState(data: SetupData): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify({
    configured: true,
    miningMode: data.miningMode,
    mode: data.mode,
    data,
  }, null, 2));
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
    const state = await loadState();
    const containers = await getStackStatus(state.mode);
    
    const running = state.mode === 'jd'
      ? (containers.translator?.status === 'healthy' || containers.translator?.status === 'starting') &&
        (containers.jdc?.status === 'healthy' || containers.jdc?.status === 'starting')
      : (containers.translator?.status === 'healthy' || containers.translator?.status === 'starting');

    const response: StatusResponse = {
      configured: state.configured,
      running,
      miningMode: state.miningMode,
      mode: state.mode,
      poolName: state.data?.miningMode === 'solo' && state.data?.mode === 'jd'
        ? 'Sovereign Solo Mining'
        : (state.data?.pool?.name ?? null),
      containers,
    };

    res.json(response);
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
 * Try to open the Unix socket to confirm something is actually listening.
 * Filesystem checks are not enough — Bitcoin Core leaves its socket file on
 * disk after a crash, so stat() would return a stale "valid" result.
 */
function probeUnixSocket(socketPath: string, timeoutMs = 1000): Promise<{ valid: true } | { valid: false; error: string }> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ path: socketPath });
    let settled = false;
    const finish = (result: { valid: true } | { valid: false; error: string }) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ valid: true }));
    socket.once('timeout', () => finish({
      valid: false,
      error: `Socket did not respond within ${timeoutMs}ms. Bitcoin Core may be unresponsive.`,
    }));
    socket.once('error', (err: NodeJS.ErrnoException) => {
      switch (err.code) {
        case 'ENOENT':
          finish({ valid: false, error: `Socket not found at ${socketPath}. Make sure Bitcoin Core is running with IPC enabled.` });
          break;
        case 'ECONNREFUSED':
          finish({ valid: false, error: `Socket file exists at ${socketPath} but nothing is listening. Bitcoin Core may have crashed or been stopped.` });
          break;
        case 'EACCES':
          finish({ valid: false, error: `Permission denied for ${socketPath}. Check that the sv2-ui process can read this file.` });
          break;
        case 'ENOTSOCK':
          finish({ valid: false, error: `Path ${socketPath} is not a Unix socket.` });
          break;
        default:
          finish({ valid: false, error: err.message || 'Unknown error connecting to socket' });
      }
    });
  });
}

/**
 * POST /api/validate/bitcoin-socket - Check if a Bitcoin Core IPC socket is listening
 */
app.post('/api/validate/bitcoin-socket', async (req, res) => {
  const { socket_path } = req.body;
  if (!socket_path || typeof socket_path !== 'string') {
    return res.status(400).json({ valid: false, error: 'socket_path is required' });
  }

  const resolved = expandHomePath(socket_path);
  const result = await probeUnixSocket(resolved);
  return res.json(result);
});

/**
 * PUT /api/config - Update configuration and restart with new values
 */
app.put('/api/config', async (req, res) => {
  try {
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

    const requiresPool = !(newData.miningMode === 'solo' && newData.mode === 'jd');

    if (!newData.mode || !newData.translator || (requiresPool && !newData.pool)) {
      return res.status(400).json({ success: false, error: 'Missing required configuration' });
    }

    if (newData.mode === 'jd' && (!newData.jdc || !newData.bitcoin)) {
      return res.status(400).json({ success: false, error: 'JD mode requires JDC and Bitcoin configuration' });
    }

    await ensureDockerAvailable();

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
  try {
    const data = normalizeSetupData(req.body as SetupData);
    const requiresPool = !(data.miningMode === 'solo' && data.mode === 'jd');

    // Validate required fields
    if (!data.mode || !data.translator || (requiresPool && !data.pool)) {
      return res.status(400).json({ success: false, error: 'Missing required configuration' });
    }

    if (data.mode === 'jd' && (!data.jdc || !data.bitcoin)) {
      return res.status(400).json({ success: false, error: 'JD mode requires JDC and Bitcoin configuration' });
    }

    await ensureDockerAvailable();

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
  }
});

/**
 * POST /api/stop - Stop the stack
 */
app.post('/api/stop', async (_req, res) => {
  try {
    await stopStack();
    res.json({ success: true });
  } catch (error) {
    console.error('Stop error:', error);
    res.status(500).json({ success: false, error: 'Failed to stop stack' });
  }
});

/**
 * POST /api/restart - Restart the stack
 */
app.post('/api/restart', async (_req, res) => {
  try {
    const state = await loadState();
    if (!state.configured || !state.data) {
      return res.status(400).json({ success: false, error: 'Not configured' });
    }

    await stopStack();
    await startStack(state.data, CONFIG_DIR);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Restart error:', error);
    res.status(500).json({ success: false, error: 'Failed to restart stack' });
  }
});

/**
 * POST /api/reset - Reset configuration (stop containers and delete config)
 */
app.post('/api/reset', async (_req, res) => {
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
  const targetUrl = `${getContainerUrl('sv2-translator', 9092)}/api${req.url}`;
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
  const targetUrl = `${getContainerUrl('sv2-jdc', 9091)}/api${req.url}`;
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

// Start server
const isProduction = process.env.NODE_ENV === 'production';

app.listen(PORT, () => {
  const dockerConnection = getDockerConnectionInfo();
  
  console.log(`sv2-ui server running on http://localhost:${PORT}`);
  console.log(`Config directory: ${CONFIG_DIR}`);
  console.log(`Docker: ${dockerConnection.endpoint} (${dockerConnection.source})`);

  if (isProduction) {
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
