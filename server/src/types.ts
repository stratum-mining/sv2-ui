import type { MiningMode, SetupMode, HealthStatus, PoolConfig, BitcoinConfig, JdcConfig, TranslatorConfig, SetupData } from '@sv2-ui/shared';
import type { ServiceConfigIssue } from './service-config.js';

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
  dockerError: string | null;
  autoStarting?: boolean;
  shouldBeRunning?: boolean;
  miningMode: MiningMode | null;
  mode: SetupMode | null;
  poolName: string | null;
  activePoolIndex: number | null;
  activePoolAddress: string | null;
  activePoolPort: number | null;
  activePoolAuthorityPublicKey: string | null;
  configurationIssues: ServiceConfigIssue[];
  containers: {
    translator: ContainerStatus | null;
    jdc: ContainerStatus | null;
  };
}

export interface SetupResponse {
  success: boolean;
  error?: string;
}
