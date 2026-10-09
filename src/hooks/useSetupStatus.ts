import { useQuery } from '@tanstack/react-query';
import { authFetch, AuthError } from '@/lib/auth-fetch';

export interface SetupStatus {
  configured: boolean;
  running: boolean;
  /** JD mode: JDC is up while the Translator is down and being restarted. */
  degraded?: boolean;
  /** Seconds since the Translator went down; null unless degraded. */
  degradedForSecs?: number | null;
  /** The Translator has stayed down for a minute while JDC was connected upstream. */
  translatorFailing?: boolean;
  /** JD pool mining: every pool failed and JDC is mining solo until restarted. */
  soloFallback?: boolean;
  dockerError: string | null;
  autoStarting?: boolean;
  shouldBeRunning?: boolean;
  miningMode: 'solo' | 'pool' | null;
  mode: 'jd' | 'no-jd' | null;
  poolName: string | null;
  activePoolIndex: number | null;
  activePoolAddress: string | null;
  activePoolPort: number | null;
  activePoolAuthorityPublicKey: string | null;
  configurationIssues: Array<{
    code: string;
    title: string;
    message: string;
  }>;
  containers: {
    translator: { id: string; name: string; status: string } | null;
    jdc: { id: string; name: string; status: string } | null;
  };
}

/** Thrown when the backend is reachable but returned a 5xx error. */
export class BackendError extends Error {
  constructor() {
    super('Backend is struggling (5xx status)');
    this.name = 'BackendError';
  }
}
/**
 * Fetch setup status from the backend.
 * Returns null if backend is not available (standalone mode).
 */
async function fetchSetupStatus(): Promise<SetupStatus | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await authFetch('/api/status', {
      signal: controller.signal,
      credentials: 'same-origin',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status >= 500) {
        throw new BackendError();
      }
      return null;
    }

    return response.json();
  } catch (error) {
    if (error instanceof AuthError || error instanceof BackendError) throw error;
    // Backend not available - standalone mode
    return null;
  }
}

export function deriveSetupStatus(
  status: SetupStatus | null | undefined,
  error: Error | null,
  isLoadingData: boolean,
) {
  const isUnauthenticated = error instanceof AuthError;
  const isBackendError = error instanceof BackendError;

  // Consider loaded when: we have data, OR we have an error, OR query is not loading
  const isLoading = isLoadingData && !error && status === undefined;

  return {
    isLoading,
    isError: !!error,
    isUnauthenticated,
    isBackendError,
    // If status is null or undefined, we're in standalone mode (no backend)
    isOrchestrated: status !== null && status !== undefined,
    isConfigured: status?.configured ?? false,
    isRunning: status?.running ?? false,
    isDegraded: status?.degraded ?? false,
    degradedForSecs: status?.degradedForSecs ?? null,
    translatorFailing: status?.translatorFailing ?? false,
    soloFallback: status?.soloFallback ?? false,
    dockerError: status?.dockerError ?? null,
    autoStarting: status?.autoStarting ?? false,
    shouldBeRunning: status?.shouldBeRunning ?? false,
    miningMode: status?.miningMode ?? null,
    mode: status?.mode ?? null,
    poolName: status?.poolName ?? null,
    activePoolIndex: status?.activePoolIndex ?? null,
    activePoolAddress: status?.activePoolAddress ?? null,
    activePoolPort: status?.activePoolPort ?? null,
    activePoolAuthorityPublicKey: status?.activePoolAuthorityPublicKey ?? null,
    configurationIssues: status?.configurationIssues ?? [],
    containers: status?.containers ?? { translator: null, jdc: null },
    // User needs setup if: orchestrated mode AND not yet configured
    needsSetup: status !== null && status !== undefined && !status.configured,
  };
}

/**
 * Hook to check setup status.
 * 
 * Returns:
 * - isOrchestrated: true if running with orchestration backend
 * - isConfigured: true if setup has been completed
 * - isRunning: true if containers are running
 * - isDegraded: true if JDC is running while the Translator restarts
 * - needsSetup: true if user should be redirected to /setup
 */
export function useSetupStatus() {
  const query = useQuery({
    queryKey: ['setup-status'],
    queryFn: fetchSetupStatus,
    staleTime: 5000,
    // Stop polling once the backend has told us we are unauthenticated;
    // otherwise the login screen would emit a 401 every five seconds.
    refetchInterval: (q) => (q.state.error instanceof AuthError ? false : 5000),
    retry: false,
  });

  return {
    ...deriveSetupStatus(query.data, query.error, query.isLoading),
    refetch: query.refetch,
  };
}
