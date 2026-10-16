import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { authFetch, AuthError } from '@/lib/auth-fetch';
import type { LogDiagnosticsResponse } from '@/types/log-diagnostics';

async function fetchLogDiagnostics(): Promise<LogDiagnosticsResponse | null> {
  try {
    const response = await authFetch('/api/logs/diagnostics', {
      signal: AbortSignal.timeout(2500),
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch (error) {
    if (error instanceof AuthError) throw error;
    return null;
  }
}

/**
 * Which diagnostics snapshot the dashboard should show right now.
 *
 * Diagnostics are polled every few seconds, and only a snapshot that covers
 * every container is evidence. A failed poll, or one marked `partial` because
 * a container is mid remove/create, says nothing about the diagnoses in the
 * logs. Treating either as "no diagnostics" makes the generic connection
 * error banner flash on between real diagnostic banners — the exact
 * flapping PR #96's banners are meant to avoid.
 *
 * So a snapshot is held until a later complete one contradicts it, including
 * one that finds nothing: a clean read clears the last diagnosis, a stopped
 * stack clears the banners.
 */
export function resolveDiagnosticsSnapshot(
  previous: LogDiagnosticsResponse | null,
  payload: LogDiagnosticsResponse | null,
): LogDiagnosticsResponse | null {
  if (!payload || payload.partial) {
    return previous;
  }

  return payload;
}

export function useLogDiagnostics(enabled = true) {
  // Held in a ref rather than module scope so a remount re-derives it from a
  // fresh poll instead of replaying an out-of-date one.
  const lastSnapshot = useRef<LogDiagnosticsResponse | null>(null);

  return useQuery({
    queryKey: ['log-diagnostics'],
    queryFn: async () => {
      lastSnapshot.current = resolveDiagnosticsSnapshot(
        lastSnapshot.current,
        await fetchLogDiagnostics(),
      );
      return lastSnapshot.current;
    },
    refetchInterval: enabled ? 3000 : false,
    retry: false,
    enabled,
  });
}
