import { useQuery } from '@tanstack/react-query';
import { authFetch, AuthError } from '@/lib/auth-fetch';

export interface SetupStatus {
  configured: boolean;
  running: boolean;
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

/** Thrown when the backend is reachable but rejects us as unauthenticated. */
export class UnauthenticatedError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'UnauthenticatedError';
  }
}

/**
 * Fetch setup status from the backend.
 * Returns null if backend is not available (standalone mode).
 */
async function fetchSetupStatus(): Promise<SetupStatus | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const response = await authFetch('/api/status', {
      signal: controller.signal,
      credentials: 'same-origin',
    });

    clearTimeout(timeoutId);

    if (response.status === 401) {
      throw new UnauthenticatedError();
    }

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch (error) {
    if (error instanceof UnauthenticatedError || error instanceof AuthError) throw error;
    // Backend not available - standalone mode
    return null;
  }
}

/**
 * Hook to check setup status.
 * 
 * Returns:
 * - isOrchestrated: true if running with orchestration backend
 * - isConfigured: true if setup has been completed
 * - isRunning: true if containers are running
 * - needsSetup: true if user should be redirected to /setup
 */
export function useSetupStatus() {
  const query = useQuery({
    queryKey: ['setup-status'],
    queryFn: fetchSetupStatus,
    staleTime: 5000,
    // Stop polling once the backend has told us we are unauthenticated;
    // otherwise the login screen would emit a 401 every five seconds.
    refetchInterval: (q) => (q.state.error instanceof UnauthenticatedError ? false : 5000),
    retry: false,
  });

  const status = query.data;
  const isUnauthenticated = query.error instanceof UnauthenticatedError;

  // Consider loaded when: we have data, OR we have an error, OR query is not loading
  // This ensures we don't get stuck in loading state
  const isLoading = query.isLoading && !query.isError && status === undefined;

  return {
    isLoading,
    isError: query.isError,
    // The backend is present but refused us; the caller must not treat this as
    // standalone mode.
    isUnauthenticated,
    // If status is null or undefined, we're in standalone mode (no backend)
    isOrchestrated: status !== null && status !== undefined,
    isConfigured: status?.configured ?? false,
    isRunning: status?.running ?? false,
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
    refetch: query.refetch,
  };
}
