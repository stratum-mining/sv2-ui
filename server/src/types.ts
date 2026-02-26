export interface SetupRequest {
  userIdentity: string;
  selectedPool: string;
  selectedNetwork: 'mainnet' | 'testnet4' | 'regtest';
  constructTemplates: boolean;
  skipTproxy?: boolean;

  // Translator fields
  minIndividualMinerHashrate?: number;
  aggregateChannels?: boolean;
  enableVardiff?: boolean;
  clientSharesPerMinute?: number;
  tproxyUpstreamAuthorityPubkey?: string;

  // JDC fields (when constructTemplates=true)
  jdcSignature?: string;
  coinbaseRewardScript?: string;
  clientShareBatchSize?: number;
  clientFeeThreshold?: number;
  clientMinInterval?: number;
  socketPath?: string;
}

export interface ContainerStatus {
  exists: boolean;
  state: 'running' | 'stopped' | 'not_found';
  image?: string;
  ports?: Record<string, number>;
}

export interface StatusResponse {
  tproxy: ContainerStatus;
  jd_client: ContainerStatus;
  network: {
    name: string;
    exists: boolean;
  };
}

export interface SetupResponse {
  status: 'ok';
  mode: 'tproxy-only' | 'jd';
  containers: {
    tproxy?: ContainerStatus;
    jd_client?: ContainerStatus;
  };
}

export interface ControlRequest {
  containers?: ('tproxy' | 'jd_client')[];
}

// Bitcoin Core Docker types

export type BitcoinNetwork = 'mainnet' | 'testnet4' | 'regtest';

export type BitcoinBuildState = 'idle' | 'building' | 'built' | 'error';

export interface BitcoinBuildStatus {
  state: BitcoinBuildState;
  progress?: string;
  error?: string;
}

export interface BitcoinStatusResponse {
  container: 'not_found' | 'running' | 'stopped';
  build: BitcoinBuildStatus;
  blockchainInfo?: {
    chain: string;
    blocks: number;
    headers: number;
    verificationprogress: number;
    initialblockdownload: boolean;
  };
}

export interface BitcoinStartRequest {
  network: BitcoinNetwork;
}

export interface BitcoinLogsResponse {
  logs: string;
}
