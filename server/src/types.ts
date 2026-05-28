import type { MiningMode, SetupMode, HealthStatus, PoolConfig, BitcoinConfig, JdcConfig, TranslatorConfig, SetupData } from '@sv2-ui/shared';

export type { PoolConfig, BitcoinConfig, JdcConfig, TranslatorConfig, SetupData };

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
