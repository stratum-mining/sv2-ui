/**
 * Generate TOML configuration files for JDC and Translator
 * Based on sv2-apps/docker/config templates
 */

import {
  JDC_AUTHORITY_PUBLIC_KEY,
  JDC_PORT,
  TRANSLATOR_PORT,
  shouldAggregateTranslatorChannelsForPools,
  isFullDonationIdentity,
  DEFAULT_SHARES_PER_MINUTE,
  DEFAULT_DOWNSTREAM_EXTRANONCE2_SIZE,
  MAX_DOWNSTREAM_EXTRANONCE2_SIZE,
  DEFAULT_MIN_HASHRATE,
  bitcoinCoreVersionToIpcMajor,
  formatSupportedVersions,
  normalizeMinerTelemetryCidr,
} from '@sv2-ui/shared';
import type { JdcConfig, PoolConfig, SetupData, TranslatorConfig } from './types.js';

const MONITORING_CACHE_REFRESH_SECS = 5;

function positiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function validDownstreamExtranonce2Size(value: number | undefined): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value > 0
    && value <= MAX_DOWNSTREAM_EXTRANONCE2_SIZE;
}

function downstreamExtranonce2Size(value: number | undefined): number {
  return validDownstreamExtranonce2Size(value)
    ? value
    : DEFAULT_DOWNSTREAM_EXTRANONCE2_SIZE;
}

function legacyIdentity(data: SetupData): string {
  const legacyData = data as SetupData & {
    translator?: (TranslatorConfig & { user_identity?: string }) | null;
    jdc?: (JdcConfig & { user_identity?: string }) | null;
  };

  return legacyData.translator?.user_identity
    || legacyData.jdc?.user_identity
    || data.pool?.user_identity
    || '';
}

function normalizePool(pool: PoolConfig | null | undefined, fallbackIdentity: string): PoolConfig | null {
  if (!pool) return null;

  const legacyPool = pool as PoolConfig & { user_identity?: string };
  return {
    name: legacyPool.name ?? 'Custom Pool',
    address: legacyPool.address ?? '',
    port: legacyPool.port ?? 0,
    jds_port: legacyPool.jds_port,
    authority_public_key: legacyPool.authority_public_key ?? '',
    user_identity: legacyPool.user_identity || fallbackIdentity,
  };
}

function normalizeFallbackPools(data: SetupData, fallbackIdentity: string): PoolConfig[] {
  const legacyData = data as SetupData & {
    fallbackPool?: PoolConfig | null;
    fallbackPools?: PoolConfig[];
  };

  const fallbackPools = Array.isArray(legacyData.fallbackPools)
    ? legacyData.fallbackPools
    : legacyData.fallbackPool
      ? [legacyData.fallbackPool]
      : [];

  if (data.miningMode === 'solo' && data.mode === 'jd') {
    return [];
  }

  return fallbackPools
    .map((pool) => normalizePool(pool, fallbackIdentity))
    .filter((pool): pool is PoolConfig => Boolean(pool));
}

function upstreamPools(data: SetupData): PoolConfig[] {
  if (data.miningMode === 'solo' && data.mode === 'jd') {
    return [];
  }

  return [
    data.pool,
    ...(data.fallbackPools ?? []),
  ].filter((pool): pool is PoolConfig => Boolean(pool));
}

function shouldVerifyPayout(data: SetupData): boolean {
  if (data.miningMode !== 'solo' || data.mode !== 'no-jd') {
    return false;
  }

  const pools = upstreamPools(data);
  return data.translator?.verify_payout !== false
    && pools.length > 0
    && pools.every((pool) => !isFullDonationIdentity(pool.user_identity));
}

function minerTelemetryConfig(cidr: string): string {
  if (!cidr) return '';

  return `# LAN subnet containing ASIC miner web/API addresses (for example, 192.168.1.0/24).
[miner_telemetry]
cidrs = ["${cidr}"]
`;
}

export function normalizeSetupData(data: SetupData): SetupData {
  const fallbackIdentity = legacyIdentity(data);
  const pool = normalizePool(data.pool, fallbackIdentity);
  const fallbackPools = normalizeFallbackPools(data, fallbackIdentity);
  const isSoloPool = data.miningMode === 'solo' && data.mode === 'no-jd';
  const legacyData = data as SetupData & {
    jdc?: (JdcConfig & { user_identity?: string }) | null;
  };
  const legacyJdcIdentity = legacyData.jdc?.user_identity || '';
  const legacySovereignSoloSignature = data.miningMode === 'solo' && data.mode === 'jd'
    ? legacyJdcIdentity
    : '';
  const jdc = data.jdc
    ? {
        jdc_signature: data.jdc.jdc_signature || legacySovereignSoloSignature,
        coinbase_reward_address: data.jdc.coinbase_reward_address ?? '',
      }
    : null;

  if (!data.translator) {
    return {
      miningMode: data.miningMode,
      mode: data.mode,
      miner_telemetry_cidr: normalizeMinerTelemetryCidr(data.miner_telemetry_cidr),
      pool,
      fallbackPools,
      bitcoin: data.bitcoin,
      jdc,
      translator: null,
    };
  }

  return {
    miningMode: data.miningMode,
    mode: data.mode,
    miner_telemetry_cidr: normalizeMinerTelemetryCidr(data.miner_telemetry_cidr),
    pool,
    fallbackPools,
    bitcoin: data.bitcoin,
    jdc,
    translator: {
      enable_vardiff: data.translator.enable_vardiff,
      aggregate_channels: shouldAggregateTranslatorChannelsForPools([pool, ...fallbackPools]),
      ...(isSoloPool ? { verify_payout: data.translator.verify_payout ?? true } : {}),
      min_hashrate: positiveNumber(data.translator.min_hashrate, DEFAULT_MIN_HASHRATE),
      shares_per_minute: positiveNumber(data.translator.shares_per_minute, DEFAULT_SHARES_PER_MINUTE),
      downstream_extranonce2_size: downstreamExtranonce2Size(
        data.translator.downstream_extranonce2_size,
      ),
    },
  };
}

/**
 * Generate Translator Proxy config (tproxy-config.toml)
 */
export function generateTranslatorConfig(data: SetupData): string {
  const normalizedData = normalizeSetupData(data);
  const { pool, translator, mode, jdc } = normalizedData;
  const isJdMode = mode === 'jd';
  const isSovereignSolo = normalizedData.miningMode === 'solo' && isJdMode;
  const isSoloPool = normalizedData.miningMode === 'solo' && mode === 'no-jd';

  if (!translator || (!isJdMode && !pool)) {
    throw new Error('Pool and translator configuration are required');
  }

  // If JD mode, translator connects to JDC container; otherwise directly to pool
  // Both containers are on sv2-network, so we can use the container name as hostname
  // (hostname resolution supported since sv2-apps PR #286)
  const verifyPayout = shouldVerifyPayout(normalizedData);
  const verifyPayoutConfig = isSoloPool
    ? `# Verify upstream coinbase outputs against the configured payout
verify_payout = ${verifyPayout}

`
    : '';

  // Min hashrate from user config (default 100 TH/s if not set)
  const minHashrate = `${positiveNumber(translator.min_hashrate, DEFAULT_MIN_HASHRATE)}.0`;
  // Shares per minute target
  const sharesPerMinute = positiveNumber(translator.shares_per_minute, DEFAULT_SHARES_PER_MINUTE).toFixed(1);
  const normalizedDownstreamExtranonce2Size = downstreamExtranonce2Size(
    translator.downstream_extranonce2_size,
  );

  const upstreams = isJdMode
    ? [{
        address: 'sv2-jdc',
        port: JDC_PORT,
        authority_public_key: JDC_AUTHORITY_PUBLIC_KEY,
        user_identity: isSovereignSolo
          ? (jdc?.jdc_signature || 'solo_miner')
          : pool!.user_identity,
      }]
    : upstreamPools(normalizedData);

  const upstreamsConfig = upstreams.map((upstream) => `[[upstreams]]
address = "${upstream.address}"
port = ${upstream.port}
authority_pubkey = "${upstream.authority_public_key}"
user_identity = "${upstream.user_identity}"
`).join('\n');

  return `# Translator Proxy Configuration
# Generated by sv2-ui

# Local Mining Device Downstream Connection
downstream_address = "0.0.0.0"
downstream_port = ${TRANSLATOR_PORT}

# Version support
max_supported_version = 2
min_supported_version = 2

# Extranonce2 size for downstream connections
downstream_extranonce2_size = ${normalizedDownstreamExtranonce2Size}

${verifyPayoutConfig}
# Aggregate channels: if true, all miners share one upstream channel
aggregate_channels = ${translator.aggregate_channels}

# Protocol extensions configuration
supported_extensions = []
required_extensions = []

# Monitoring HTTP server address
monitoring_address = "0.0.0.0:9092"
monitoring_cache_refresh_secs = ${MONITORING_CACHE_REFRESH_SECS}

${minerTelemetryConfig(normalizedData.miner_telemetry_cidr)}
# Difficulty params
[downstream_difficulty_config]
min_individual_miner_hashrate = ${minHashrate}
shares_per_minute = ${sharesPerMinute}
enable_vardiff = true
job_keepalive_interval_secs = 60

${upstreamsConfig}
`;
}

/**
 * Generate JD Client config (jdc-config.toml)
 */
export function generateJdcConfig(data: SetupData): string | null {
  if (data.mode !== 'jd' || !data.jdc || !data.bitcoin) {
    return null;
  }

  const normalizedData = normalizeSetupData(data);
  const { pool, fallbackPools, jdc, bitcoin } = normalizedData;
  if (!jdc || !bitcoin) {
    return null;
  }

  const bitcoinCoreIpcVersion = bitcoinCoreVersionToIpcMajor(bitcoin.core_version);
  if (!bitcoinCoreIpcVersion) {
    throw new Error(`Bitcoin Core IPC version ${formatSupportedVersions()} is required`);
  }

  const isSovereignSolo = normalizedData.miningMode === 'solo';
  const jdcSignature = isSovereignSolo ? (jdc.jdc_signature || 'solo_miner') : jdc.jdc_signature;

  // Shares per minute and batch size
  const sharesPerMinute = positiveNumber(
    normalizedData.translator?.shares_per_minute,
    DEFAULT_SHARES_PER_MINUTE,
  ).toFixed(1);
  const shareBatchSize = '5';
  // Fee threshold and min interval for template provider
  const feeThreshold = '1000';
  const minInterval = '5';
  const jdcUpstreamPools = !isSovereignSolo && pool
    ? [pool, ...(fallbackPools ?? [])]
    : [];
  const upstreamsConfig = jdcUpstreamPools.length > 0
    ? `# Upstream pool connections
${jdcUpstreamPools.map((upstream) => `[[upstreams]]
authority_pubkey = "${upstream.authority_public_key}"
pool_address = "${upstream.address}"
pool_port = ${upstream.port}
jds_address = "${upstream.address}"
jds_port = ${upstream.jds_port ?? 3334}
user_identity = "${upstream.user_identity}"
`).join('\n')}
`
    : `# No upstreams needed in solo mining mode.
upstreams = []

`;

  return `# JD Client Configuration
# Generated by sv2-ui

listening_address = "0.0.0.0:${JDC_PORT}"

# Version support
max_supported_version = 2
min_supported_version = 2

# Auth keys for downstream connections
authority_public_key = "${JDC_AUTHORITY_PUBLIC_KEY}"
authority_secret_key = "mkDLTBBRxdBv998612qipDYoTK3YUrqLe8uWw7gu3iXbSrn2n"
cert_validity_sec = 3600

# Shares configuration
shares_per_minute = ${sharesPerMinute}
share_batch_size = ${shareBatchSize}

# JDC mode: FULLTEMPLATE, COINBASEONLY, or SOLOMINING
mode = "${isSovereignSolo ? 'SOLOMINING' : 'FULLTEMPLATE'}"

# String to be added into the Coinbase scriptSig
jdc_signature = "${jdcSignature}"

# Solo Mining config - coinbase output for sovereign or fallback solo mining
coinbase_reward_script = "addr(${jdc.coinbase_reward_address})"

# Protocol Extensions
supported_extensions = []
required_extensions = []

# Monitoring HTTP server address
monitoring_address = "0.0.0.0:9091"
monitoring_cache_refresh_secs = ${MONITORING_CACHE_REFRESH_SECS}

${upstreamsConfig}${minerTelemetryConfig(normalizedData.miner_telemetry_cidr)}
# Bitcoin Core IPC config
[template_provider_type.BitcoinCoreIpc]
version = ${bitcoinCoreIpcVersion}
network = "${bitcoin.network}"
fee_threshold = ${feeThreshold}
min_interval = ${minInterval}
`;
}
