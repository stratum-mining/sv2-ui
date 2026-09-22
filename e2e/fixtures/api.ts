import type { SetupData } from '../../src/components/setup/types';
import type { SetupStatus } from '../../src/hooks/useSetupStatus';
import type {
  GlobalInfo,
  ServerChannelsResponse,
  Sv1ClientsResponse,
  Sv2ClientChannelsResponse,
  Sv2ClientsResponse,
} from '../../src/types/api';
import type {
  ContainerLogsResponse,
  LogDiagnosticsResponse,
} from '../../src/types/log-diagnostics';

export const TEST_AUTHORITY_PUBLIC_KEY =
  '9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72';

export const testSetupData: SetupData = {
  miningMode: 'pool',
  mode: 'no-jd',
  miner_telemetry_cidr: '',
  pool: {
    name: 'Test Pool',
    address: 'pool.example.test',
    port: 34254,
    authority_public_key: TEST_AUTHORITY_PUBLIC_KEY,
    user_identity: 'test-worker',
  },
  fallbackPools: [],
  bitcoin: null,
  jdc: null,
  translator: {
    enable_vardiff: true,
    aggregate_channels: false,
    min_hashrate: 100_000_000_000,
    shares_per_minute: 6,
    downstream_extranonce2_size: 4,
  },
};

export const testStatus: SetupStatus = {
  configured: true,
  running: true,
  autoStarting: false,
  shouldBeRunning: true,
  miningMode: 'pool',
  mode: 'no-jd',
  poolName: 'Test Pool',
  activePoolIndex: 0,
  activePoolAddress: 'pool.example.test',
  activePoolPort: 34254,
  activePoolAuthorityPublicKey: TEST_AUTHORITY_PUBLIC_KEY,
  configurationIssues: [],
  containers: {
    translator: {
      id: 'translator-test-id',
      name: 'sv2-translator',
      status: 'healthy',
    },
    jdc: null,
  },
};

export const testGlobal: GlobalInfo = {
  uptime_secs: 3600,
  server: {
    extended_channels: 1,
    standard_channels: 0,
    total_channels: 1,
    total_hashrate: 500_000_000_000,
  },
  sv1_clients: {
    total_clients: 1,
    total_hashrate: 500_000_000_000,
  },
  sv2_clients: null,
};

export const testServerChannels: ServerChannelsResponse = {
  offset: 0,
  limit: 100,
  total_extended: 1,
  total_standard: 0,
  extended_channels: [{
    acknowledged_work_sum: 12,
    best_diff: 123.45,
    blocks_found: 0,
    channel_id: 7,
    extranonce_prefix_hex: '01020304',
    full_extranonce_size: 8,
    nominal_hashrate: 500_000_000_000,
    rollable_extranonce_size: 4,
    shares_acknowledged: 12,
    shares_rejected: 1,
    shares_rejected_by_reason: { stale: 1 },
    shares_submitted: 13,
    target_hex: '00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    user_identity: 'test-worker',
    validated_work_sum: 12,
    version_rolling: true,
  }],
  standard_channels: [],
};

export const testSv1Clients: Sv1ClientsResponse = {
  offset: 0,
  limit: 1000,
  total: 1,
  items: [{
    channel_id: 7,
    client_id: 11,
    connection_ip: '192.0.2.10',
    extranonce1_hex: '0102',
    extranonce2_len: 4,
    hashrate: 500_000_000_000,
    management_ip: null,
    miner_telemetry: null,
    miner_telemetry_status: null,
    stable_hashrate: true,
    sv1_username: 'test-worker',
    sv1_worker_name: 'worker-1',
    target_hex: '00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    version_rolling_mask: null,
    version_rolling_min_bit: null,
  }],
};

export const testSv2Clients: Sv2ClientsResponse = {
  offset: 0,
  limit: 100,
  total: 0,
  items: [],
};

export const testSv2ClientChannels: Sv2ClientChannelsResponse = {
  client_id: 0,
  offset: 0,
  limit: 100,
  total_extended: 0,
  total_standard: 0,
  extended_channels: [],
  standard_channels: [],
};

export const testDiagnostics: LogDiagnosticsResponse = {
  configured: true,
  mode: 'no-jd',
  generatedAt: '2026-01-01T00:00:00.000Z',
  streams: [{
    id: 'mining-services',
    label: 'Mining services',
    containers: ['translator'],
    collated: true,
    source: 'docker-container-logs',
  }],
  diagnostics: [],
};

export const testLogs: ContainerLogsResponse = {
  configured: true,
  mode: 'no-jd',
  generatedAt: '2026-01-01T00:00:00.000Z',
  streams: testDiagnostics.streams,
  lines: [],
};

export const testBitcoinDiscovery = [{
  valid: true as const,
  dataDir: '/tmp/bitcoin',
  network: 'mainnet' as const,
  chain: 'main',
  version: 310000,
  initialBlockDownload: false,
}];
