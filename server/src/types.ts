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
  /** Every service the configured mode needs is up. */
  running: boolean;
  /**
   * JD mode only: JDC is up while the Translator is down, or restarted and
   * not yet confirmed up. JDC keeps its upstream and SV2 firmware keeps
   * mining; SV1 firmware reconnects once the Translator is back.
   */
  degraded: boolean;
  /** Seconds since the Translator went down; null unless degraded. */
  degradedForSecs: number | null;
  /** The Translator has stayed down for a minute while JDC was connected upstream. */
  translatorFailing: boolean;
  /**
   * JD pool mining only: every configured pool failed, so JDC is mining solo
   * to the solo fallback address until mining restarts.
   */
  soloFallback: boolean;
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
