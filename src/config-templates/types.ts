// Shared types for configuration templates and pool data

export interface PoolConfig {
  name: string;
  address: string;
  port: number;
  authorityPubkey: string;
  aggregateChannels: boolean;
  iconUrl?: string; // URL to pool icon/image
  // JDS endpoints (for pools that support JD mode)
  jdsAddress?: string;
  jdsPort?: number;
  // Optional: network-specific configurations
  networks?: {
    mainnet?: Partial<PoolConfig>;
    testnet4?: Partial<PoolConfig>;
    regtest?: Partial<PoolConfig>;
  };
}

export interface ConfigTemplateData {
  // Authority keys
  authorityPublicKey?: string;
  authoritySecretKey?: string;

  // User identity
  userIdentity?: string;

  // Network and connection
  network?: 'mainnet' | 'testnet4' | 'regtest';
  socketPath?: string;
  dataDir?: string; // Custom Bitcoin data directory path

  // Pool configuration
  poolSignature?: string;
  poolPayoutAddress?: string;
  listenAddress?: string;

  // JD Client configuration
  jdcSignature?: string;
  coinbaseRewardAddress?: string;

  // Difficulty and shares
  sharesPerMinute?: number;
  shareBatchSize?: number;
  minIndividualMinerHashrate?: number;
  clientSharesPerMinute?: number; // For translator when used with client config

  // Fee and interval
  feeThreshold?: number;
  minInterval?: number;

  // Translator proxy
  aggregateChannels?: boolean;
  enableVardiff?: boolean;

  // RPC configuration (for JDS)
  coreRpcUrl?: string;
  coreRpcPort?: number;
  coreRpcUser?: string;
  coreRpcPass?: string;

  // Upstream configuration
  upstreamAddress?: string;
  upstreamPort?: number;
  upstreamAuthorityPubkey?: string;

  // Selected pool
  selectedPool?: string;
}

export type ConfigType =
  | 'jd-client'
  | 'translator';
