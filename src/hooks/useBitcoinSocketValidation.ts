import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

interface SocketValidationResult {
  valid: boolean;
  error?: string;
}

// Returns null when the backend is not reachable (standalone mode — skip validation).
async function validateSocket(socketPath: string): Promise<SocketValidationResult | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch('/api/validate/bitcoin-socket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ socket_path: socketPath }),
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
export function useBitcoinSocketValidation(socketPath: string, debounceMs = 800) {
  const [debouncedPath, setDebouncedPath] = useState(socketPath);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedPath(socketPath), debounceMs);
    return () => clearTimeout(t);
  }, [socketPath, debounceMs]);

  const { data, isFetching } = useQuery({
    queryKey: ['bitcoin-socket-validation', debouncedPath],
    queryFn: () => validateSocket(debouncedPath),
    enabled: !!debouncedPath,
    staleTime: 10_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const isPathStale = debouncedPath !== socketPath;

  return {
    isChecking: isFetching || isPathStale,
    isValid: data?.valid === true,
    error: data && !data.valid ? data.error : undefined,
    skipped: data === null,
  };
}
