import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateJdcConfig, generateTranslatorConfig, normalizeSetupData } from './config-generator.js';
import type { SetupData } from './types.js';

const BASE_DATA_30: SetupData = {
  miningMode: 'pool',
  mode: 'jd',
  miner_telemetry_cidr: '192.168.1.0/24',
  pool: {
    name: 'Custom Pool',
    address: 'pool.example.com',
    port: 34254,
    authority_public_key: 'authority-key',
    user_identity: 'miner.worker1',
  },
  fallbackPools: [],
  bitcoin: {
    core_version: '30',
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

const BASE_DATA_31: SetupData = {
  ...BASE_DATA_30,
  bitcoin: { ...BASE_DATA_30.bitcoin!, core_version: '31' },
};

const BASE_DATA_31_SOLO: SetupData = {
  ...BASE_DATA_31,
  miningMode: 'solo',
  pool: null,
};

const NO_JD_DATA: SetupData = {
  miningMode: 'pool',
  mode: 'no-jd',
  miner_telemetry_cidr: '192.168.1.0/24',
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

test('translator config uses advanced setup values', () => {
  const config = generateTranslatorConfig(BASE_DATA_30);

  assert.match(config, /min_individual_miner_hashrate = 100000000000000\.0/);
  assert.match(config, /downstream_extranonce2_size = 8/);
  assert.match(config, /shares_per_minute = 12\.5/);
  assert.match(config, /monitoring_cache_refresh_secs = 5/);
  assert.match(config, /\[miner_telemetry\]\ncidrs = \["192\.168\.1\.0\/24"\]/);
});

test('translator config omits payout verification for pool mining', () => {
  const config = generateTranslatorConfig(BASE_DATA_30);

  assert.doesNotMatch(config, /verify_payout/);
});

test('translator config enables payout verification for solo pool mining', () => {
  const config = generateTranslatorConfig({
    ...BASE_DATA_30,
    miningMode: 'solo',
    mode: 'no-jd',
    pool: {
      ...BASE_DATA_30.pool!,
      user_identity: 'tb1qexample',
    },
  });

  assert.match(config, /user_identity = "tb1qexample"/);
  assert.match(config, /verify_payout = true/);
});

test('translator config allows payout verification to be disabled for solo pool mining', () => {
  const config = generateTranslatorConfig({
    ...BASE_DATA_30,
    miningMode: 'solo',
    mode: 'no-jd',
    pool: {
      ...BASE_DATA_30.pool!,
      user_identity: 'tb1qexample',
    },
    translator: {
      ...BASE_DATA_30.translator!,
      verify_payout: false,
    },
  });

  assert.match(config, /verify_payout = false/);
});

test('translator config disables payout verification for full donation solo identities', () => {
  const config = generateTranslatorConfig({
    ...BASE_DATA_30,
    miningMode: 'solo',
    mode: 'no-jd',
    pool: {
      ...BASE_DATA_30.pool!,
      user_identity: 'sri/donate/worker1',
    },
  });

  assert.match(config, /user_identity = "sri\/donate\/worker1"/);
  assert.match(config, /verify_payout = false/);
});

test('translator config omits payout verification for sovereign solo mining', () => {
  const config = generateTranslatorConfig({
    ...BASE_DATA_30,
    miningMode: 'solo',
    pool: null,
    fallbackPools: [],
    jdc: {
      ...BASE_DATA_30.jdc!,
      jdc_signature: '',
    },
  });

  assert.match(config, /user_identity = "solo_miner"/);
  assert.doesNotMatch(config, /verify_payout/);
});

test('jdc config uses shared shares-per-minute and miner signature', () => {
  const config = generateJdcConfig(BASE_DATA_30);

  assert.ok(config);
  assert.match(config, /shares_per_minute = 12\.5/);
  assert.match(config, /reserved_downstream_rollable_extranonce_size = 8/);
  assert.match(config, /jdc_signature = "custom-miner-tag"/);
  assert.match(config, /monitoring_cache_refresh_secs = 5/);
  assert.match(config, /\[miner_telemetry\]\ncidrs = \["192\.168\.1\.0\/24"\]/);
});

test('miner telemetry config is omitted when LAN CIDR is blank', () => {
  const data = {
    ...BASE_DATA_30,
    miner_telemetry_cidr: '',
  };

  const translatorConfig = generateTranslatorConfig(data);
  const jdcConfig = generateJdcConfig(data);

  assert.doesNotMatch(translatorConfig, /\[miner_telemetry\]/);
  assert.ok(jdcConfig);
  assert.doesNotMatch(jdcConfig, /\[miner_telemetry\]/);
});

test('jdc config reserves the configured downstream extranonce size', () => {
  const config = generateJdcConfig({
    ...BASE_DATA_31,
    translator: {
      ...BASE_DATA_31.translator!,
      downstream_extranonce2_size: 2,
    },
  });

  assert.ok(config);
  assert.match(config, /reserved_downstream_rollable_extranonce_size = 2/);
});

test('normalization backfills advanced defaults for old saved configs', () => {
  const data = {
    ...BASE_DATA_30,
    miner_telemetry_cidr: undefined,
    translator: {
      ...BASE_DATA_30.translator,
      min_hashrate: undefined,
      shares_per_minute: undefined,
      downstream_extranonce2_size: undefined,
    },
  } as unknown as SetupData;

  const normalized = normalizeSetupData(data);

  assert.ok(normalized.translator);
  assert.equal(normalized.translator.min_hashrate, 100_000_000_000_000);
  assert.equal(normalized.miner_telemetry_cidr, '');
  assert.equal(normalized.translator.shares_per_minute, 6);
  assert.equal(normalized.translator.downstream_extranonce2_size, 4);
  assert.equal('verify_payout' in normalized.translator, false);
});

test('normalization replaces an out-of-range downstream extranonce2 size', () => {
  const normalized = normalizeSetupData({
    ...BASE_DATA_30,
    translator: {
      ...BASE_DATA_30.translator!,
      downstream_extranonce2_size: 1_000_000_000_000,
    },
  });

  assert.equal(normalized.translator?.downstream_extranonce2_size, 4);
  assert.match(generateTranslatorConfig(normalized), /downstream_extranonce2_size = 4/);
});

test('normalization backfills payout verification only for solo pool mining', () => {
  const normalized = normalizeSetupData({
    ...BASE_DATA_30,
    miningMode: 'solo',
    mode: 'no-jd',
    pool: {
      ...BASE_DATA_30.pool!,
      user_identity: 'tb1qexample',
    },
  });

  assert.ok(normalized.translator);
  assert.equal(normalized.translator.verify_payout, true);
});

test('normalization migrates legacy translator identity into primary and fallback pools', () => {
  const data = {
    ...BASE_DATA_30,
    pool: {
      name: 'Legacy Primary',
      address: 'legacy.primary',
      port: 3333,
      authority_public_key: 'legacy-primary-key',
    },
    fallbackPool: {
      name: 'Legacy Fallback',
      address: 'legacy.fallback',
      port: 4444,
      authority_public_key: 'legacy-fallback-key',
    },
    fallbackPools: undefined,
    translator: {
      ...BASE_DATA_30.translator,
      user_identity: 'legacy.worker',
    },
  } as unknown as SetupData;

  const normalized = normalizeSetupData(data);

  assert.equal(normalized.pool?.user_identity, 'legacy.worker');
  assert.equal(normalized.fallbackPools.length, 1);
  assert.equal(normalized.fallbackPools[0].user_identity, 'legacy.worker');
  assert.equal('fallbackPool' in normalized, false);
  assert.equal('user_identity' in normalized.translator!, false);
});

test('normalization migrates legacy jdc identity to the pool without changing pool-mode signature', () => {
  const data = {
    ...BASE_DATA_30,
    pool: {
      name: 'Legacy Primary',
      address: 'legacy.primary',
      port: 3333,
      authority_public_key: 'legacy-primary-key',
    },
    jdc: {
      user_identity: 'legacy.pool.worker',
      jdc_signature: '',
      coinbase_reward_address: 'tb1qexample',
    },
  } as unknown as SetupData;

  const normalized = normalizeSetupData(data);

  assert.equal(normalized.pool?.user_identity, 'legacy.pool.worker');
  assert.equal(normalized.jdc?.jdc_signature, '');
});

test('normalization preserves legacy sovereign solo identity as signature fallback', () => {
  const data = {
    ...BASE_DATA_31_SOLO,
    mode: 'jd',
    jdc: {
      user_identity: 'legacy_solo_miner',
      jdc_signature: '',
      coinbase_reward_address: 'tb1qexample',
    },
  } as unknown as SetupData;

  const normalized = normalizeSetupData(data);

  assert.equal(normalized.pool, null);
  assert.equal(normalized.fallbackPools.length, 0);
  assert.equal(normalized.jdc?.jdc_signature, 'legacy_solo_miner');
});

test('normalization enables translator aggregation when a fallback pool requires it', () => {
  const normalized = normalizeSetupData({
    ...NO_JD_DATA,
    fallbackPools: [
      {
        name: 'Braiins Pool',
        address: 'stratum.braiins.com',
        port: 3333,
        authority_public_key: 'fallback-key',
        user_identity: 'miner.fallback',
      },
    ],
  });

  assert.equal(normalized.translator?.aggregate_channels, true);
});

test('translator puts user_identity inside [[upstreams]] for JD mode', () => {
  const config = generateTranslatorConfig(BASE_DATA_30);
  const upstreamIdx = config.indexOf('[[upstreams]]');
  const identityIdx = config.indexOf('user_identity');

  assert.ok(identityIdx > upstreamIdx);
  assert.equal(config.slice(0, upstreamIdx).includes('user_identity'), false);
  assert.match(config, /\[\[upstreams\]\][\s\S]*user_identity = "miner\.worker1"/);
});

test('jdc in pool mode puts user_identity inside [[upstreams]]', () => {
  const config = generateJdcConfig(BASE_DATA_30);

  assert.ok(config);
  const upstreamIdx = config.indexOf('[[upstreams]]');
  const identityIdx = config.indexOf('user_identity');

  assert.ok(identityIdx > upstreamIdx);
  assert.equal(config.slice(0, upstreamIdx).includes('user_identity'), false);
  assert.match(config, /\[\[upstreams\]\][\s\S]*user_identity = "miner\.worker1"/);
});

test('jdc config uses a custom JD port and keeps the default when omitted', () => {
  const config = generateJdcConfig({
    ...BASE_DATA_30,
    pool: {
      ...BASE_DATA_30.pool!,
      jds_port: 3337,
    },
    fallbackPools: [
      {
        name: 'Fallback Pool',
        address: 'fallback.pool.com',
        port: 4444,
        authority_public_key: 'fallback-key',
        user_identity: 'miner.fallback',
      },
    ],
  });

  assert.ok(config);
  const fallbackIdx = config.indexOf('pool_address = "fallback.pool.com"');

  assert.ok(fallbackIdx > 0);
  assert.match(config.slice(0, fallbackIdx), /jds_port = 3337/);
  assert.match(config.slice(fallbackIdx), /jds_port = 3334/);
});

test('jdc config writes Bitcoin Core IPC version', () => {
  const config30 = generateJdcConfig(BASE_DATA_30);
  const config31 = generateJdcConfig(BASE_DATA_31);

  assert.ok(config30);
  assert.ok(config31);
  assert.match(config30, /\[template_provider_type\.BitcoinCoreIpc\]\nversion = 30/);
  assert.match(config31, /\[template_provider_type\.BitcoinCoreIpc\]\nversion = 31/);
});

test('jdc config maps legacy Bitcoin Core point versions to IPC majors', () => {
  const legacyData = {
    ...BASE_DATA_31,
    bitcoin: { ...BASE_DATA_31.bitcoin!, core_version: '31.0' },
  } as unknown as SetupData;

  const config = generateJdcConfig(legacyData);

  assert.ok(config);
  assert.match(config, /\[template_provider_type\.BitcoinCoreIpc\]\nversion = 31/);
});

test('jdc in solo mode omits user_identity entirely', () => {
  const config = generateJdcConfig(BASE_DATA_31_SOLO);

  assert.ok(config);
  assert.doesNotMatch(config, /user_identity/);
  assert.match(config, /upstreams = \[\]/);
});

test('jdc in solo mode emits upstreams before miner telemetry table', () => {
  const config = generateJdcConfig(BASE_DATA_31_SOLO);

  assert.ok(config);

  const upstreamsIndex = config.indexOf('upstreams = []');
  const telemetryIndex = config.indexOf('[miner_telemetry]');

  assert.notEqual(upstreamsIndex, -1);
  assert.notEqual(telemetryIndex, -1);
  assert.ok(upstreamsIndex < telemetryIndex);
});

test('no-jd mode: translator uses new format (user_identity inside [[upstreams]])', () => {
  const config = generateTranslatorConfig(NO_JD_DATA);
  const upstreamIdx = config.indexOf('[[upstreams]]');
  const identityIdx = config.indexOf('user_identity');

  assert.ok(identityIdx > upstreamIdx);
  assert.match(config, /\[\[upstreams\]\][\s\S]*user_identity = "miner\.solo"/);
});

test('no-jd mode: translator emits fallback upstreams after the primary pool', () => {
  const config = generateTranslatorConfig({
    ...NO_JD_DATA,
    fallbackPools: [
      {
        name: 'Fallback Pool',
        address: 'fallback.pool.com',
        port: 4444,
        authority_public_key: 'fallback-key',
        user_identity: 'miner.fallback',
      },
    ],
  });

  const primaryIdx = config.indexOf('address = "remote.pool.com"');
  const fallbackIdx = config.indexOf('address = "fallback.pool.com"');

  assert.ok(primaryIdx > 0);
  assert.ok(fallbackIdx > primaryIdx);
  assert.match(config, /address = "remote\.pool\.com"[\s\S]*user_identity = "miner\.solo"/);
  assert.match(config, /address = "fallback\.pool\.com"[\s\S]*user_identity = "miner\.fallback"/);
});

test('jdc config emits fallback upstreams after the primary pool', () => {
  const config = generateJdcConfig({
    ...BASE_DATA_30,
    fallbackPools: [
      {
        name: 'Fallback Pool',
        address: 'fallback.pool.com',
        port: 4444,
        authority_public_key: 'fallback-key',
        user_identity: 'miner.fallback',
      },
    ],
  });

  assert.ok(config);
  const primaryIdx = config.indexOf('pool_address = "pool.example.com"');
  const fallbackIdx = config.indexOf('pool_address = "fallback.pool.com"');

  assert.ok(primaryIdx > 0);
  assert.ok(fallbackIdx > primaryIdx);
  assert.match(config, /pool_address = "pool\.example\.com"[\s\S]*user_identity = "miner\.worker1"/);
  assert.match(config, /pool_address = "fallback\.pool\.com"[\s\S]*user_identity = "miner\.fallback"/);
});
