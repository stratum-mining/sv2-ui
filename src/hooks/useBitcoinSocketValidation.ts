import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isRetryableBitcoinSocketError } from '@/lib/bitcoinSocketErrors';

interface SocketValidationResult {
  valid: boolean;
  error?: string;
}

type BitcoinSocketValidationParams = {
  socketPath: string;
  network: 'mainnet' | 'testnet4';
  coreVersion: '30.2' | '31.0' | null;
};

// Returns null when the backend is not reachable (standalone mode — skip validation).
async function validateSocket({
  socketPath,
  network,
  coreVersion,
}: BitcoinSocketValidationParams): Promise<SocketValidationResult | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

    const response = await fetch('/api/validate/bitcoin-socket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        socket_path: socketPath,
        network,
        core_version: coreVersion,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

/**
 * Validate a Bitcoin Core IPC socket path against the backend. Debounces the
 * input so we don't probe on every keystroke, and silently no-ops when the
 * backend isn't reachable (standalone mode).
 */
export function useBitcoinSocketValidation(
  socketPath: string,
  network: 'mainnet' | 'testnet4',
  coreVersion: '30.2' | '31.0' | null,
  debounceMs = 800
) {
  const [debouncedPath, setDebouncedPath] = useState(socketPath);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedPath(socketPath), debounceMs);
    return () => clearTimeout(t);
  }, [socketPath, debounceMs]);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['bitcoin-socket-validation', debouncedPath, network, coreVersion],
    queryFn: () => validateSocket({ socketPath: debouncedPath, network, coreVersion }),
    enabled: !!debouncedPath && !!coreVersion,
    staleTime: 0,
    retry: false,
    refetchOnMount: 'always',
    refetchInterval: (query) => {
      const result = query.state.data as SocketValidationResult | null | undefined;
      return result && !result.valid && isRetryableBitcoinSocketError(result.error) ? 5_000 : false;
    },
    refetchOnWindowFocus: false,
  });

  const isPathStale = debouncedPath !== socketPath;
  const isRetryable = data && !data.valid ? isRetryableBitcoinSocketError(data.error) : false;

  return {
    isChecking: isFetching || isPathStale,
    isRefreshing: isFetching && !!data,
    isValid: data?.valid === true,
    error: data && !data.valid ? data.error : undefined,
    isRetryable,
    retry: () => refetch(),
    skipped: data === null,
  };
}
