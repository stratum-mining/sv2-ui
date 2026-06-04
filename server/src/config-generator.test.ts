import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateJdcConfig, generateTranslatorConfig, normalizeSetupData } from './config-generator.js';
import type { SetupData } from './types.js';

const BASE_DATA_30_2: SetupData = {
  miningMode: 'pool',
  mode: 'jd',
  pool: {
    name: 'Custom Pool',
    address: 'pool.example.com',
    port: 34254,
    authority_public_key: 'authority-key',
  },
  bitcoin: {
    core_version: '30.2',
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

const BASE_DATA_31_0: SetupData = {
  ...BASE_DATA_30_2,
  bitcoin: { ...BASE_DATA_30_2.bitcoin!, core_version: '31.0' },
};

const BASE_DATA_31_0_SOLO: SetupData = {
  ...BASE_DATA_31_0,
  miningMode: 'solo',
  pool: null,
};

const NO_JD_DATA: SetupData = {
  miningMode: 'pool',
  mode: 'no-jd',
  pool: {
    name: 'Remote Pool',
    address: 'remote.pool.com',
    port: 3333,
    authority_public_key: 'remote-pool-key',
  },
  bitcoin: null,
  jdc: null,
  translator: {
    user_identity: 'miner.solo',
    enable_vardiff: true,
    aggregate_channels: false,
    min_hashrate: 100_000_000_000_000,
    shares_per_minute: 6,
    downstream_extranonce2_size: 4,
  },
};

test('translator config uses advanced setup values', () => {
  const config = generateTranslatorConfig(BASE_DATA_30_2);

  assert.match(config, /downstream_extranonce2_size = 8/);
  assert.match(config, /shares_per_minute = 12\.5/);
});

test('jdc config uses shared shares-per-minute and miner signature', () => {
  const config = generateJdcConfig(BASE_DATA_30_2);

  assert.ok(config);
  assert.match(config, /shares_per_minute = 12\.5/);
  assert.match(config, /jdc_signature = "custom-miner-tag"/);
});

test('normalization backfills advanced defaults for old saved configs', () => {
  const data = {
    ...BASE_DATA_30_2,
    translator: {
      ...BASE_DATA_30_2.translator,
      shares_per_minute: undefined,
      downstream_extranonce2_size: undefined,
    },
  } as unknown as SetupData;

  const normalized = normalizeSetupData(data);

  assert.ok(normalized.translator);
  assert.equal(normalized.translator.shares_per_minute, 6);
  assert.equal(normalized.translator.downstream_extranonce2_size, 4);
});

test('old format (v0.3.5): translator puts user_identity at top level, not inside [[upstreams]]', () => {
  const config = generateTranslatorConfig(BASE_DATA_30_2);

  assert.match(config, /^user_identity = "miner\.worker1"/m);
  assert.doesNotMatch(config, /\[\[upstreams\]\][\s\S]*user_identity = "miner\.worker1"/);
});

test('old format (v0.3.5): jdc puts user_identity at top level, not inside [[upstreams]]', () => {
  const config = generateJdcConfig(BASE_DATA_30_2);

  assert.ok(config);
  assert.match(config, /^user_identity = "miner\.worker1"/m);
  assert.doesNotMatch(config, /\[\[upstreams\]\][\s\S]*user_identity = "miner\.worker1"/);
});

test('new format (main): translator puts user_identity inside [[upstreams]], not at top level', () => {
  const config = generateTranslatorConfig(BASE_DATA_31_0);
  const upstreamIdx = config.indexOf('[[upstreams]]');
  const identityIdx = config.indexOf('user_identity');

  assert.ok(identityIdx > upstreamIdx);
  assert.match(config, /\[\[upstreams\]\][\s\S]*user_identity = "miner\.worker1"/);
});

test('new format (main): jdc in pool mode puts user_identity inside [[upstreams]], not at top level', () => {
  const config = generateJdcConfig(BASE_DATA_31_0);

  assert.ok(config);
  const upstreamIdx = config.indexOf('[[upstreams]]');
  const identityIdx = config.indexOf('user_identity');

  assert.ok(identityIdx > upstreamIdx);
  assert.match(config, /\[\[upstreams\]\][\s\S]*user_identity = "miner\.worker1"/);
});

test('new format (main): jdc in solo mode omits user_identity entirely', () => {
  const config = generateJdcConfig(BASE_DATA_31_0_SOLO);

  assert.ok(config);
  assert.doesNotMatch(config, /user_identity/);
  assert.match(config, /upstreams = \[\]/);
});

test('no-jd mode: translator uses new format (user_identity inside [[upstreams]])', () => {
  const config = generateTranslatorConfig(NO_JD_DATA);
  const upstreamIdx = config.indexOf('[[upstreams]]');
  const identityIdx = config.indexOf('user_identity');

  assert.ok(identityIdx > upstreamIdx);
  assert.match(config, /\[\[upstreams\]\][\s\S]*user_identity = "miner\.solo"/);
});
