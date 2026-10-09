import { useTranslatorHealth, useJdcHealth, usePoolData } from './usePoolData';
import { useSetupStatus } from './useSetupStatus';

export interface ConnectionStatus {
  status: 'connected' | 'degraded' | 'connecting' | 'disconnected';
  statusLabel: string | null;
  poolName: string | null;
  activePoolAddress: string | null;
  activePoolPort: number | null;
  activePoolAuthorityPublicKey: string | null;
  uptime: number;
}

type ResolveConnectionStatusOptions = {
  isHealthLoading: boolean;
  servicesHealthy: boolean;
  /** JD mode: JDC is healthy while the Translator is not. */
  translatorOnlyDown: boolean;
  isOrchestrated: boolean;
  isRunning: boolean;
  isSovereignSolo: boolean;
  activePoolIndex: number | null;
};

export function resolveConnectionStatus({
  isHealthLoading,
  servicesHealthy,
  translatorOnlyDown,
  isOrchestrated,
  isRunning,
  isSovereignSolo,
  activePoolIndex,
}: ResolveConnectionStatusOptions): ConnectionStatus['status'] {
  const hasConfirmedPool = !isOrchestrated || isSovereignSolo || activePoolIndex !== null;
  const isAwaitingPool = isOrchestrated && (isRunning || translatorOnlyDown) && !isSovereignSolo && activePoolIndex === null;

  if (isHealthLoading || isAwaitingPool) return 'connecting';
  if (!hasConfirmedPool) return 'disconnected';
  if (servicesHealthy) return 'connected';
  // JDC stays on its upstream and keeps mining for SV2 firmware; SV1
  // firmware reconnects once auto-start brings the Translator back.
  return translatorOnlyDown ? 'degraded' : 'disconnected';
}

/**
 * Single source of truth for header connection status.
 * Use this in any page that renders <Shell> to keep the indicator consistent.
 */
export function useConnectionStatus(): ConnectionStatus {
  const {
    isOrchestrated,
    isRunning,
    miningMode,
    mode: templateMode,
    poolName,
    activePoolIndex,
    activePoolAddress,
    activePoolPort,
    activePoolAuthorityPublicKey,
  } = useSetupStatus();
  const { isJdMode, global: poolGlobal } = usePoolData(templateMode);

  const { data: translatorOk, isLoading: translatorHealthLoading, isError: translatorHealthError } =
    useTranslatorHealth();
  const { data: jdcOk, isLoading: jdcHealthLoading, isError: jdcHealthError } =
    useJdcHealth(isJdMode);

  const translatorHealthy = translatorOk === true && !translatorHealthError;
  const jdcHealthy        = jdcOk === true && !jdcHealthError;
  const isHealthLoading   = translatorHealthLoading || (isJdMode && jdcHealthLoading);
  const isSovereignSolo   = miningMode === 'solo' && templateMode === 'jd';
  const servicesHealthy   = isJdMode ? (translatorHealthy && jdcHealthy) : translatorHealthy;
  const translatorOnlyDown = isJdMode && jdcHealthy && !translatorHealthy;
  const status = resolveConnectionStatus({
    isHealthLoading,
    servicesHealthy,
    translatorOnlyDown,
    isOrchestrated,
    isRunning,
    isSovereignSolo,
    activePoolIndex,
  });
  // In JD mode the uptime comes from JDC, which keeps running while degraded.
  const hasUpstream = status === 'connected' || status === 'degraded';

  return {
    status,
    statusLabel: isSovereignSolo ? 'Sovereign Solo' : null,
    poolName: hasUpstream ? (poolName ?? null) : null,
    activePoolAddress: hasUpstream ? activePoolAddress : null,
    activePoolPort: hasUpstream ? activePoolPort : null,
    activePoolAuthorityPublicKey: hasUpstream ? activePoolAuthorityPublicKey : null,
    uptime:   hasUpstream ? (poolGlobal?.uptime_secs ?? 0) : 0,
  };
}
