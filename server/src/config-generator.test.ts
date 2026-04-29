import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateJdcConfig, generateTranslatorConfig, normalizeSetupData } from './config-generator.js';
import type { SetupData } from './types.js';

const BASE_DATA: SetupData = {
  miningMode: 'pool',
  mode: 'jd',
  pool: {
    name: 'Custom Pool',
    address: 'pool.example.com',
    port: 34254,
    authority_public_key: 'authority-key',
  },
  bitcoin: {
    network: 'testnet4',
    os: 'linux',
    customDataDir: '',
    socket_path: '/tmp/bitcoin.sock',
  },
  jdc: {
    user_identity: 'miner.worker1',
    jdc_signature: 'custom-miner-tag',
    coinbase_reward_address: 'tb1qexample',
  },
  translator: {
    user_identity: 'miner.worker1',
    enable_vardiff: true,
    aggregate_channels: false,
    min_hashrate: 100_000_000_000_000,
    shares_per_minute: 12.5,
    downstream_extranonce2_size: 8,
  },
};

test('translator config uses advanced setup values', () => {
  const config = generateTranslatorConfig(BASE_DATA);

  assert.match(config, /downstream_extranonce2_size = 8/);
  assert.match(config, /shares_per_minute = 12\.5/);
});

test('jdc config uses shared shares-per-minute and miner signature', () => {
  const config = generateJdcConfig(BASE_DATA);

  assert.ok(config);
  assert.match(config, /shares_per_minute = 12\.5/);
  assert.match(config, /jdc_signature = "custom-miner-tag"/);
});

test('normalization backfills advanced defaults for old saved configs', () => {
  const data = {
    ...BASE_DATA,
    translator: {
      ...BASE_DATA.translator,
      shares_per_minute: undefined,
      downstream_extranonce2_size: undefined,
    },
  } as unknown as SetupData;

  const normalized = normalizeSetupData(data);

  assert.equal(normalized.translator.shares_per_minute, 6);
  assert.equal(normalized.translator.downstream_extranonce2_size, 4);
});
