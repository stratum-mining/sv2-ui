import assert from 'node:assert/strict';
import test from 'node:test';

import { generateTranslatorConfig, generateJdcConfig, normalizeSetupData } from './config-generator.js';
import type { PoolConfig, SetupData } from './types.js';

const BASE_DATA_30_2: SetupData = {
  miningMode: 'pool',
  mode: 'jd',
  pool: {
    name: 'Custom Pool',
    address: 'pool.example.com',
    port: 34254,
    authority_public_key: 'authority-key',
    user_identity: 'miner.worker1',
  },
  fallbackPools: [],
  bitcoin: {
    core_version: '30.2',
    network: 'testnet4',
    os: 'linux',
    customDataDir: '',
    socket_path: '/tmp/bitcoin.sock',
  },
  jdc: {
    jdc_signature: 'custom-miner-tag',
    coinbase_reward_address: 'tb1qexample',
  },
  translator: {
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
    user_identity: 'miner.solo',
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

const PRIMARY: PoolConfig = {
  name: 'Primary',
  address: 'pool-a.example.com',
  port: 3333,
  authority_public_key: '9awtMD5KQgvRUh2yFbjVeT7b6hjipWcAsQHd6wEhgtDT9soosna',
  user_identity: 'primary.worker',
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

test('translator config in JD mode emits empty user_identity when pool has none set', () => {
  const data = baseData({
    mode: 'jd',
    pool: { name: 'Primary', address: 'pool-a.example.com', port: 3333, authority_public_key: '9awtMD5KQgvRUh2yFbjVeT7b6hjipWcAsQHd6wEhgtDT9soosna' },
    bitcoin: { network: 'mainnet', os: 'linux', customDataDir: '', socket_path: '/tmp/x' },
    jdc: { jdc_signature: '', coinbase_reward_address: 'bc1q' },
  });
  const toml = generateTranslatorConfig(data);
  assert.match(toml, /user_identity = ""/, 'empty identity emitted — MiningIdentityStep must populate pool.user_identity before setup');
});

test('translator config in JD mode never emits fallbacks — JDC handles failover', () => {
  const data = baseData({
    mode: 'jd',
    fallbackPools: [FALLBACK_1, FALLBACK_2],
    bitcoin: { network: 'mainnet', os: 'linux', customDataDir: '', socket_path: '/tmp/x' },
    jdc: { jdc_signature: '', coinbase_reward_address: 'bc1q' },
  });
  const toml = generateTranslatorConfig(data);
  assert.equal(countOccurrences(toml, '[[upstreams]]'), 1);
  assert.match(toml, /address = "sv2-jdc"/);
  assert.match(toml, /user_identity = "primary\.worker"/, 'JDC upstream must have user_identity');
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
    jdc: { jdc_signature: 'sig', coinbase_reward_address: 'bc1q' },
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
    jdc: { jdc_signature: '', coinbase_reward_address: 'bc1q' },
  });
  const toml = generateJdcConfig(data);
  assert.ok(toml);
  assert.match(toml!, /upstreams = \[\]/);
  assert.equal(countOccurrences(toml!, '[[upstreams]]'), 0);
});

test('translator config uses advanced setup values', () => {
  const data = baseData({
    translator: {
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
    jdc: { jdc_signature: 'custom-miner-tag', coinbase_reward_address: 'bc1q' },
    translator: {
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

test('translator fallback block emits user_identity when set on fallback pool', () => {
  const fallbackWithId: PoolConfig = { ...FALLBACK_1, user_identity: 'bc1qtest.worker1' };
  const toml = generateTranslatorConfig(baseData({ fallbackPools: [fallbackWithId, FALLBACK_2] }));
  const f1Idx = toml.indexOf(FALLBACK_1.address);
  const f2Idx = toml.indexOf(FALLBACK_2.address);
  // user_identity line appears after fallback 1's address
  const idIdx = toml.indexOf('user_identity = "bc1qtest.worker1"');
  assert.ok(idIdx > f1Idx, 'user_identity should appear after fallback 1 address');
  assert.ok(idIdx < f2Idx, 'user_identity should appear before fallback 2 address');
  // fallback 2 has no per-upstream identity
  assert.ok(!toml.slice(f2Idx).includes('user_identity = "bc1qtest.worker1"'));
});

test('translator fallback block uses primary pool identity when fallback has none', () => {
  const toml = generateTranslatorConfig(baseData({ fallbackPools: [FALLBACK_1] }));
  const f1Idx = toml.indexOf(FALLBACK_1.address);
  const afterF1 = toml.slice(f1Idx);
  assert.ok(afterF1.includes(`user_identity = "${PRIMARY.user_identity}"`), 'fallback uses primary identity when unset');
});

test('jdc config emits user_identity per upstream when set', () => {
  const primaryWithId: PoolConfig = { ...PRIMARY, user_identity: 'bc1qprimary.worker' };
  const fallbackWithId: PoolConfig = { ...FALLBACK_1, user_identity: 'bc1qfallback.worker' };
  const data = baseData({
    mode: 'jd',
    pool: primaryWithId,
    fallbackPools: [fallbackWithId, FALLBACK_2],
    bitcoin: { network: 'mainnet', os: 'linux', customDataDir: '', socket_path: '/tmp/x' },
    jdc: { jdc_signature: 'sig', coinbase_reward_address: 'bc1q' },
  });
  const toml = generateJdcConfig(data);
  assert.ok(toml);
  // primary upstream has per-upstream identity
  const primaryIdx = toml!.indexOf(PRIMARY.address);
  const primaryIdIdx = toml!.indexOf('user_identity = "bc1qprimary.worker"');
  assert.ok(primaryIdIdx > primaryIdx, 'primary user_identity after primary address');
  // fallback 1 has per-upstream identity
  const f1Idx = toml!.indexOf(FALLBACK_1.address);
  const f1IdIdx = toml!.indexOf('user_identity = "bc1qfallback.worker"');
  assert.ok(f1IdIdx > f1Idx, 'fallback1 user_identity after fallback1 address');
  const f2Idx = toml!.indexOf(FALLBACK_2.address);
  const afterF2 = toml!.slice(f2Idx);
  assert.ok(afterF2.includes('user_identity = "bc1qprimary.worker"'), 'fallback2 uses primary pool identity');
});

test('jdc config uses primary pool identity for upstreams when not explicitly set', () => {
  const data = baseData({
    mode: 'jd',
    fallbackPools: [FALLBACK_1],
    bitcoin: { network: 'mainnet', os: 'linux', customDataDir: '', socket_path: '/tmp/x' },
    jdc: { jdc_signature: 'sig', coinbase_reward_address: 'bc1q' },
  });
  const toml = generateJdcConfig(data);
  assert.ok(toml);
  const upstreamsIdx = toml!.indexOf('[[upstreams]]');
  const afterUpstreams = toml!.slice(upstreamsIdx);
  assert.ok(afterUpstreams.includes(`user_identity = "${PRIMARY.user_identity}"`), 'upstreams use primary pool identity');
});

test('normalization backfills advanced defaults for old saved configs', () => {
  const data = baseData({
    translator: {
      enable_vardiff: true,
      aggregate_channels: false,
      min_hashrate: 100_000_000_000_000,
    } as unknown as SetupData['translator'],
  });
  const normalized = normalizeSetupData(data);
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

test('old format (v0.3.5): jdc emits fallback upstreams sharing the top-level user_identity', () => {
  const data: SetupData = {
    ...BASE_DATA_30_2,
    fallbackPools: [FALLBACK_1, FALLBACK_2],
  };
  const config = generateJdcConfig(data);

  assert.ok(config);
  // top-level identity present, none inside the [[upstreams]] blocks
  assert.match(config, /^user_identity = "miner\.worker1"/m);
  const upstreamsIdx = config.indexOf('[[upstreams]]');
  assert.ok(!config.slice(upstreamsIdx).includes('user_identity'), 'no per-upstream identity in old format');
  // primary + 2 fallbacks all emitted
  assert.ok(config.includes(FALLBACK_1.address) && config.includes(FALLBACK_2.address));
  assert.equal((config.match(/\[\[upstreams\]\]/g) || []).length, 3);
});
