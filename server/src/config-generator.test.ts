import assert from 'node:assert/strict';
import test from 'node:test';

import { generateTranslatorConfig, generateJdcConfig, normalizeSetupData } from './config-generator.js';
import type { PoolConfig, SetupData } from './types.js';

const PRIMARY: PoolConfig = {
  name: 'Primary',
  address: 'pool-a.example.com',
  port: 3333,
  authority_public_key: '9awtMD5KQgvRUh2yFbjVeT7b6hjipWcAsQHd6wEhgtDT9soosna',
};

const FALLBACK_1: PoolConfig = {
  name: 'Fallback 1',
  address: 'pool-b.example.com',
  port: 4444,
  authority_public_key: '9bCoFxTszKCuffyywH5uS5o6WcU4vsjTH2axxc7wE86y2HhvULU',
};

const FALLBACK_2: PoolConfig = {
  name: 'Fallback 2',
  address: 'pool-c.example.com',
  port: 5555,
  authority_public_key: '9cDpGyTtaLDvggzzxI6vT6p7XdV5wtkUI3byyd8xF97z3IiwVMV',
};

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    count += 1;
    i += needle.length;
  }
  return count;
}

function baseData(overrides: Partial<SetupData> = {}): SetupData {
  return {
    miningMode: 'pool',
    mode: 'no-jd',
    pool: PRIMARY,
    fallbackPools: [],
    bitcoin: null,
    jdc: null,
    translator: {
      user_identity: 'worker',
      enable_vardiff: true,
      aggregate_channels: false,
      min_hashrate: 100_000_000_000_000,
      shares_per_minute: 6,
      downstream_extranonce2_size: 4,
    },
    ...overrides,
  };
}

test('translator config emits one [[upstreams]] block when fallbackPools is empty', () => {
  const toml = generateTranslatorConfig(baseData({ fallbackPools: [] }));
  assert.equal(countOccurrences(toml, '[[upstreams]]'), 1);
});

test('translator config emits N+1 [[upstreams]] blocks for N fallbacks, in order', () => {
  const toml = generateTranslatorConfig(baseData({ fallbackPools: [FALLBACK_1, FALLBACK_2] }));
  assert.equal(countOccurrences(toml, '[[upstreams]]'), 3);
  const primaryIdx = toml.indexOf(PRIMARY.address);
  const f1Idx = toml.indexOf(FALLBACK_1.address);
  const f2Idx = toml.indexOf(FALLBACK_2.address);
  assert.ok(primaryIdx < f1Idx && f1Idx < f2Idx, 'upstreams must appear in declaration order');
});

test('translator config in JD mode never emits fallbacks — JDC handles failover', () => {
  const data = baseData({
    mode: 'jd',
    fallbackPools: [FALLBACK_1, FALLBACK_2],
    bitcoin: { network: 'mainnet', os: 'linux', customDataDir: '', socket_path: '/tmp/x' },
    jdc: { user_identity: 'w', jdc_signature: '', coinbase_reward_address: 'bc1q' },
  });
  const toml = generateTranslatorConfig(data);
  assert.equal(countOccurrences(toml, '[[upstreams]]'), 1);
  assert.match(toml, /address = "sv2-jdc"/);
  assert.ok(
    !toml.includes(FALLBACK_1.address) && !toml.includes(FALLBACK_2.address),
    'fallbacks should not appear in translator TOML in JD mode',
  );
});

test('jdc config emits N+1 [[upstreams]] blocks for N fallbacks', () => {
  const data = baseData({
    mode: 'jd',
    fallbackPools: [FALLBACK_1, FALLBACK_2],
    bitcoin: { network: 'mainnet', os: 'linux', customDataDir: '', socket_path: '/tmp/x' },
    jdc: { user_identity: 'w', jdc_signature: 'sig', coinbase_reward_address: 'bc1q' },
  });
  const toml = generateJdcConfig(data);
  assert.ok(toml);
  assert.equal(countOccurrences(toml!, '[[upstreams]]'), 3);
  assert.match(toml!, /\(primary\)/);
  assert.match(toml!, /\(fallback 1\)/);
  assert.match(toml!, /\(fallback 2\)/);
});

test('jdc config in sovereign-solo mode emits empty upstreams regardless of fallbackPools', () => {
  const data = baseData({
    miningMode: 'solo',
    mode: 'jd',
    pool: null,
    fallbackPools: [FALLBACK_1],
    bitcoin: { network: 'mainnet', os: 'linux', customDataDir: '', socket_path: '/tmp/x' },
    jdc: { user_identity: 'w', jdc_signature: '', coinbase_reward_address: 'bc1q' },
  });
  const toml = generateJdcConfig(data);
  assert.ok(toml);
  assert.match(toml!, /upstreams = \[\]/);
  assert.equal(countOccurrences(toml!, '[[upstreams]]'), 0);
});

test('translator config uses advanced setup values', () => {
  const data = baseData({
    translator: {
      user_identity: 'worker',
      enable_vardiff: true,
      aggregate_channels: false,
      min_hashrate: 100_000_000_000_000,
      shares_per_minute: 12.5,
      downstream_extranonce2_size: 8,
    },
  });
  const config = generateTranslatorConfig(data);
  assert.match(config, /downstream_extranonce2_size = 8/);
  assert.match(config, /shares_per_minute = 12\.5/);
});

test('jdc config uses shared shares-per-minute and miner signature', () => {
  const data = baseData({
    mode: 'jd',
    bitcoin: { network: 'mainnet', os: 'linux', customDataDir: '', socket_path: '/tmp/x' },
    jdc: { user_identity: 'w', jdc_signature: 'custom-miner-tag', coinbase_reward_address: 'bc1q' },
    translator: {
      user_identity: 'w',
      enable_vardiff: true,
      aggregate_channels: false,
      min_hashrate: 100_000_000_000_000,
      shares_per_minute: 12.5,
      downstream_extranonce2_size: 4,
    },
  });
  const config = generateJdcConfig(data);
  assert.ok(config);
  assert.match(config!, /shares_per_minute = 12\.5/);
  assert.match(config!, /jdc_signature = "custom-miner-tag"/);
});

test('normalization backfills advanced defaults for old saved configs', () => {
  const data = baseData({
    translator: {
      user_identity: 'w',
      enable_vardiff: true,
      aggregate_channels: false,
      min_hashrate: 100_000_000_000_000,
    } as unknown as SetupData['translator'],
  });
  const normalized = normalizeSetupData(data);
  assert.equal(normalized.translator.shares_per_minute, 6);
  assert.equal(normalized.translator.downstream_extranonce2_size, 4);
});
