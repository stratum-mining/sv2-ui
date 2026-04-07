import { useEffect, useMemo, useRef, useState } from 'react';

export interface PersistedMetricEntry {
  key: string;
  value: number;
}

type PersistedMetricState = Record<string, number>;

function storageKeyFor(metricKey: string, configKey: string): string {
  return `sv2_${metricKey}:${configKey}`;
}

function loadFromStorage(metricKey: string, configKey: string): PersistedMetricState {
  try {
    const stored = localStorage.getItem(storageKeyFor(metricKey, configKey));
    if (stored) {
      return JSON.parse(stored) as PersistedMetricState;
    }
  } catch {
    // Ignore parse errors and start fresh.
  }

  return {};
}

function usePersistentMetric(
  entries: PersistedMetricEntry[],
  configKey: string,
  metricKey: string,
): PersistedMetricState {
  const [persistedCounts, setPersistedCounts] = useState<PersistedMetricState>(
    () => loadFromStorage(metricKey, configKey),
  );

  const storageKeyRef = useRef<string>(storageKeyFor(metricKey, configKey));

  useEffect(() => {
    storageKeyRef.current = storageKeyFor(metricKey, configKey);
    setPersistedCounts(loadFromStorage(metricKey, configKey));
  }, [configKey, metricKey]);

  useEffect(() => {
    if (entries.length === 0) return;

    setPersistedCounts((prev) => {
      let changed = false;
      const next = { ...prev };

      entries.forEach(({ key, value }) => {
        const normalizedValue = Math.max(0, value);
        if ((next[key] ?? 0) < normalizedValue) {
          next[key] = normalizedValue;
          changed = true;
        }
      });

      if (!changed) {
        return prev;
      }

      try {
        localStorage.setItem(storageKeyRef.current, JSON.stringify(next));
      } catch {
        // Ignore storage errors (private browsing quota, etc.)
      }

      return next;
    });
  }, [entries]);

  return persistedCounts;
}

export function usePersistentBlocksFound(
  entries: PersistedMetricEntry[],
  configKey: string,
): number {
  const persistedCounts = usePersistentMetric(entries, configKey, 'blocks_found');

  return useMemo(
    () => Object.values(persistedCounts).reduce((sum, count) => sum + count, 0),
    [persistedCounts],
  );
}

export function usePersistentBestDifficulty(
  entries: PersistedMetricEntry[],
  configKey: string,
): number {
  const persistedCounts = usePersistentMetric(entries, configKey, 'best_diff');

  return useMemo(
    () => Math.max(0, ...Object.values(persistedCounts)),
    [persistedCounts],
  );
}
