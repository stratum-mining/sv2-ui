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

import type { SetupData, StatusResponse, SetupResponse } from './types.js';
import { generateTranslatorConfig, generateJdcConfig } from './config-generator.js';
import {
  startStack,
  stopStack,
  getStackStatus,
  isDockerAvailable,
  ensureDockerAvailable,
  getDockerConnectionInfo,
} from './docker.js';

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
      poolName: state.data?.pool?.name ?? null,
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
 * POST /api/setup - Configure and start the stack
 */
app.post('/api/setup', async (req, res) => {
  try {
    const data: SetupData = req.body;

    // Validate required fields
    if (!data.mode || !data.pool || !data.translator) {
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
 * SPA fallback - serve index.html for client-side routing
 */
app.get('*', (_req, res) => {
  res.sendFile(path.join(UI_DIR, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`sv2-ui server running on http://localhost:${PORT}`);
  console.log(`Config directory: ${CONFIG_DIR}`);
  const dockerConnection = getDockerConnectionInfo();
  console.log(`Docker endpoint: ${dockerConnection.endpoint} (${dockerConnection.source})`);
});
