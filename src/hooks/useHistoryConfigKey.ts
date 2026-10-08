import { useEffect, useState } from 'react';

export const LAST_HISTORY_KEY_STORAGE_KEY = 'sv2_last_history_key';

/**
 * Dashboard totals are kept per mode and active pool. The active pool is
 * unknown while mining is stopped or starting, so the last pool's totals for
 * the same mode stay on screen instead of a separate pool-less history.
 */
export function resolveHistoryConfigKey(
  mode: string | null,
  poolName: string | null,
  lastKey: string | null,
): string {
  if (mode && poolName) return `${mode}:${poolName}`;
  if (mode && lastKey?.startsWith(`${mode}:`)) return lastKey;
  return [mode, poolName].filter(Boolean).join(':') || 'default';
}

function readLastKey(): string | null {
  try {
    return localStorage.getItem(LAST_HISTORY_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function useHistoryConfigKey(mode: string | null, poolName: string | null): string {
  const [lastKey, setLastKey] = useState<string | null>(readLastKey);
  const key = resolveHistoryConfigKey(mode, poolName, lastKey);

  useEffect(() => {
    if (!mode || !poolName || key === lastKey) return;
    setLastKey(key);
    try {
      localStorage.setItem(LAST_HISTORY_KEY_STORAGE_KEY, key);
    } catch {
      // Storage unavailable: the key is still remembered for this page.
    }
  }, [key, lastKey, mode, poolName]);

  return key;
}
