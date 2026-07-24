export type MiningMode = 'solo' | 'pool';
export type SetupMode = 'jd' | 'no-jd';

export type OperatingSystem = 'linux' | 'macos' | 'umbrel';
export type BitcoinCoreVersion = '30' | '31';
export type BitcoinNetwork = 'mainnet' | 'testnet4';

export type HealthStatus = 'healthy' | 'unhealthy' | 'starting' | 'stopped';

export interface PoolConfig {
  name: string;
  address: string;
  port: number;
  jds_port?: number;
  authority_public_key: string;
  user_identity: string;
}

export interface BitcoinConfig {
  core_version: BitcoinCoreVersion | null;
  network: BitcoinNetwork;
  os: OperatingSystem;
  customDataDir: string;
  socket_path: string;
  discoveredLogPath?: string;
}

export interface JdcConfig {
  jdc_signature: string;
  coinbase_reward_address: string;
}

export interface TranslatorConfig {
  enable_vardiff: boolean;
  aggregate_channels: boolean;
  verify_payout?: boolean;
  min_hashrate: number;
  shares_per_minute: number;
  downstream_extranonce2_size: number;
}

export interface SetupData {
  miningMode: MiningMode | null;
  mode: SetupMode | null;
  miner_telemetry_cidr: string;
  pool: PoolConfig | null;
  fallbackPools: PoolConfig[];
  bitcoin: BitcoinConfig | null;
  jdc: JdcConfig | null;
  translator: TranslatorConfig | null;
}

export type BenchmarkRunStatus =
  | 'running'
  | 'stopping'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type BenchmarkPoolStatus =
  | 'pending'
  | 'connecting'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface BenchmarkPoolResult {
  pool: PoolConfig;
  status: BenchmarkPoolStatus;
  startedAt: string | null;
  completedAt: string | null;
  averageLatencyMs: number | null;
  successfulSamples: number;
  attemptedSamples: number;
  acceptedShares: number | null;
  rejectedShares: number | null;
  error?: string;
}

export interface BenchmarkRun {
  id: string;
  status: BenchmarkRunStatus;
  poolDurationSeconds: number;
  createdAt: string;
  startedAt: string;
  completedAt: string | null;
  currentPoolIndex: number | null;
  currentPoolStartedAt: string | null;
  currentPoolEndsAt: string | null;
  selectedPools: PoolConfig[];
  results: BenchmarkPoolResult[];
  error?: string;
}

export interface BenchmarkStatusResponse {
  run: BenchmarkRun | null;
}

export interface BenchmarkStartRequest {
  pools: PoolConfig[];
  poolDurationSeconds: number;
}

export type LogContainerRole = 'translator' | 'jdc';
export type LogOutputStream = 'stdout' | 'stderr';
export type LogSourceKind = 'docker-container-logs' | 'container-log-file';
export type LogStreamId = 'mining-services';
export type DiagnosticSeverity = 'warning' | 'error';

export interface ContainerLogLine {
  container: LogContainerRole;
  stream: LogOutputStream;
  timestamp: string | null;
  message: string;
  raw: string;
}

export interface DiagnosticEvidence {
  container: LogContainerRole;
  stream: LogOutputStream;
  timestamp: string | null;
  line: string;
}

export interface LogDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  title: string;
  message: string;
  recommendation: string;
  streamId: LogStreamId;
  containers: LogContainerRole[];
  detectedAt: string | null;
  evidence: DiagnosticEvidence[];
}

export interface LogStreamDefinition {
  id: LogStreamId;
  label: string;
  containers: LogContainerRole[];
  collated: boolean;
  source: LogSourceKind;
}

export interface LogDiagnosticsResponse {
  configured: boolean;
  mode: SetupMode | null;
  generatedAt: string;
  streams: LogStreamDefinition[];
  diagnostics: LogDiagnostic[];
}

export interface ContainerLogsResponse {
  configured: boolean;
  mode: SetupMode | null;
  generatedAt: string;
  streams: LogStreamDefinition[];
  lines: ContainerLogLine[];
}
