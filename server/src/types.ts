/**
 * Shared types between frontend and backend
 */

export type MiningMode = 'solo' | 'pool';
export type SetupMode = 'jd' | 'no-jd';
export type ImagePullPolicy = 'always' | 'if-not-present' | 'never';

export interface PoolConfig {
  name: string;
  address: string;
  port: number;
  authority_public_key: string;
}

export type OperatingSystem = 'linux' | 'macos';

export interface BitcoinConfig {
  network: 'mainnet' | 'testnet4';
  os: OperatingSystem;
  customDataDir: string;
  socket_path: string;
}

export interface JdcConfig {
  user_identity: string;
  jdc_signature: string;
  coinbase_reward_address: string;
}

export interface TranslatorConfig {
  user_identity: string;
  enable_vardiff: boolean;
  aggregate_channels: boolean;
  min_hashrate: number;
}

export interface ImageConfig {
  translator_image?: string;
  jdc_image?: string;
  pull_policy?: ImagePullPolicy;
}

export interface SetupData {
  miningMode: MiningMode;
  mode: SetupMode;
  pool: PoolConfig | null;
  bitcoin: BitcoinConfig | null;
  jdc: JdcConfig | null;
  translator: TranslatorConfig;
  images?: ImageConfig | null;
}

export type HealthStatus = 'healthy' | 'unhealthy' | 'starting' | 'stopped';

export interface ContainerStatus {
  id: string;
  name: string;
  status: HealthStatus;
  ports: Record<string, string>;
}

export interface StatusResponse {
  configured: boolean;
  running: boolean;
  miningMode: MiningMode | null;
  mode: SetupMode | null;
  poolName: string | null;
  containers: {
    translator: ContainerStatus | null;
    jdc: ContainerStatus | null;
  };
}

export interface SetupResponse {
  success: boolean;
  error?: string;
}
