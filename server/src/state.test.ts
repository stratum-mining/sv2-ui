import assert from 'node:assert/strict';
import { constants, mkdtemp, open, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { JDC_AUTHORITY_PUBLIC_KEY } from '@sv2-ui/shared';
import {
  loadSavedState,
  saveSavedState,
  SavedStateError,
} from './state.js';
import { createFifo } from './test-support.js';
import type { SetupData } from './types.js';

const SETUP_DATA: SetupData = {
  miningMode: 'pool',
  mode: 'no-jd',
  miner_telemetry_cidr: '',
  pool: {
    name: 'Example Pool',
    address: 'pool.example.com',
    port: 34254,
    authority_public_key: JDC_AUTHORITY_PUBLIC_KEY,
    user_identity: 'miner.worker',
    jds_port: undefined,
  },
  fallbackPools: [],
  bitcoin: null,
  jdc: null,
  translator: {
    enable_vardiff: true,
    aggregate_channels: false,
    min_hashrate: 100_000_000_000_000,
    shares_per_minute: 6,
    downstream_extranonce2_size: 4,
  },
};

test('writes canonical saved setup atomically', async () => {
  const configDir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-state-'));
  const stateFile = path.join(configDir, 'state.json');
  try {
    await saveSavedState(stateFile, SETUP_DATA);

    const raw = JSON.parse(await readFile(stateFile, 'utf8')) as { configured: boolean };
    const state = await loadSavedState(stateFile);

    assert.equal(raw.configured, true);
    assert.equal(state.configured, true);
    assert.deepEqual(state.data, SETUP_DATA);
    assert.deepEqual((await readdir(configDir)).filter((file) => file.includes('.tmp')), []);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('normalizes legacy saved setup values', async () => {
  const configDir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-state-'));
  const stateFile = path.join(configDir, 'state.json');
  try {
    await writeFile(stateFile, JSON.stringify({
      configured: true,
      data: {
        ...SETUP_DATA,
        bitcoin: {
          core_version: '30.0',
          network: 'mainnet',
          os: 'linux',
          customDataDir: '',
          socket_path: '/tmp/bitcoin.sock',
        },
        mode: 'jd',
        jdc: { jdc_signature: 'miner', coinbase_reward_address: 'bc1qexample' },
      },
    }));

    const state = await loadSavedState(stateFile);
    assert.equal(state.data?.bitcoin?.core_version, '30');
    assert.equal(state.shouldBeRunning, true);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('never treats invalid saved setup as a fresh install', async () => {
  const configDir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-state-'));
  const stateFile = path.join(configDir, 'state.json');
  try {
    await writeFile(stateFile, '{not json');

    await assert.rejects(loadSavedState(stateFile), SavedStateError);
    assert.equal(await readFile(stateFile, 'utf8'), '{not json');
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('fails fast on a FIFO at the state path instead of blocking', async () => {
  const configDir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-state-'));
  const stateFile = path.join(configDir, 'state.json');
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    await createFifo(stateFile);

    const outcome = await Promise.race([
      loadSavedState(stateFile).then(
        (state) => state,
        (error: unknown) => error,
      ),
      new Promise<'timed-out'>((resolve) => {
        timeoutId = setTimeout(() => resolve('timed-out'), 250);
        timeoutId.unref();
      }),
    ]);

    if (outcome === 'timed-out') {
      // A spurious timeout on a stalled runner means the reader has already
      // closed. Open the writer with O_NONBLOCK so this branch can never
      // wedge a libuv worker and hang the whole test process.
      try {
        const writer = await open(stateFile, constants.O_WRONLY | constants.O_NONBLOCK);
        await writer.writeFile('attacker-controlled input');
        await writer.close();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENXIO') throw error;
      }
      assert.fail('loadSavedState blocked on a planted FIFO');
    }

    assert.ok(outcome instanceof SavedStateError, `expected SavedStateError, got ${outcome}`);
  } finally {
    clearTimeout(timeoutId);
    await rm(configDir, { recursive: true, force: true });
  }
});

test('rejects inconsistent saved-state flags without overwriting the saved data', async () => {
  const configDir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-state-'));
  const stateFile = path.join(configDir, 'state.json');
  try {
    await writeFile(stateFile, JSON.stringify({ configured: false, data: SETUP_DATA }));

    await assert.rejects(loadSavedState(stateFile), SavedStateError);
    assert.match(await readFile(stateFile, 'utf8'), /"configured":false/);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('does not follow a state-file symlink outside the config directory', async () => {
  const configDir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-state-'));
  const privateDir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-private-'));
  const stateFile = path.join(configDir, 'state.json');
  const privateFile = path.join(privateDir, 'private.json');

  try {
    await writeFile(privateFile, JSON.stringify({
      configured: true,
      data: {
        ...SETUP_DATA,
        pool: {
          ...SETUP_DATA.pool,
          name: 'private-data-readable-only-by-the-server',
        },
      },
    }));
    await symlink(privateFile, stateFile);

    await assert.rejects(
      loadSavedState(stateFile),
      SavedStateError,
    );
  } finally {
    await rm(configDir, { recursive: true, force: true });
    await rm(privateDir, { recursive: true, force: true });
  }
});
