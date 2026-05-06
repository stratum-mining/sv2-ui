import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface PersistedMetricEntry {
  key: string;
  value: number;
}

export interface PersistedShareStatsEntry {
  key: string;
  acknowledged: number;
  submitted: number;
  rejected: number;
  rejectedByReason?: Record<string, number>;
}

export interface PersistentShareStats {
  acknowledged: number;
  submitted: number;
  rejected: number;
  rejectionReasons: Array<{ reason: string; count: number }>;
  unclassifiedRejected: number;
}

type PersistedMetricState = Record<string, number>;
type PersistedShareStatsState = Record<string, {
  acknowledged: number;
  submitted: number;
  rejected: number;
  rejectedByReason: Record<string, number>;
}>;

function storageKeyFor(metricKey: string, configKey: string): string {
  return `sv2_${metricKey}:${configKey}`;
}

function createEmptyMetricState(): PersistedMetricState {
  return {};
}

function createEmptyShareStatsState(): PersistedShareStatsState {
  return {};
}

function loadFromStorage<T>(
  metricKey: string,
  configKey: string,
  createInitialState: () => T,
): T {
  try {
    const stored = localStorage.getItem(storageKeyFor(metricKey, configKey));
    if (stored) {
      return JSON.parse(stored) as T;
    }
  } catch {
    // Ignore parse errors and start fresh.
  }

  return createInitialState();
}

function usePersistentState<T>(
  metricKey: string,
  configKey: string,
  createInitialState: () => T,
): [T, (updater: (prev: T) => T) => void] {
  const [state, setState] = useState<T>(
    () => loadFromStorage(metricKey, configKey, createInitialState),
  );

  const storageKeyRef = useRef<string>(storageKeyFor(metricKey, configKey));

  useEffect(() => {
    storageKeyRef.current = storageKeyFor(metricKey, configKey);
    setState(loadFromStorage(metricKey, configKey, createInitialState));
  }, [configKey, metricKey, createInitialState]);

  const updateState = useCallback((updater: (prev: T) => T) => {
    setState((prev) => {
      const next = updater(prev);

      if (Object.is(next, prev)) {
        return prev;
      }

      try {
        localStorage.setItem(storageKeyRef.current, JSON.stringify(next));
      } catch {
        // Ignore storage errors (private browsing quota, etc.)
      }

      return next;
    });
  }, []);

  return [state, updateState];
}

function usePersistentMetric(
  entries: PersistedMetricEntry[],
  configKey: string,
  metricKey: string,
): PersistedMetricState {
  const [persistedCounts, updatePersistedCounts] = usePersistentState(
    metricKey,
    configKey,
    createEmptyMetricState,
  );

  useEffect(() => {
    if (entries.length === 0) return;

    updatePersistedCounts((prev) => {
      let changed = false;
      const next = { ...prev };

      entries.forEach(({ key, value }) => {
        const normalizedValue = Math.max(0, value);
        if ((next[key] ?? 0) < normalizedValue) {
          next[key] = normalizedValue;
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [entries, updatePersistedCounts]);

  return persistedCounts;
}

function usePersistentShareStatsEntries(
  entries: PersistedShareStatsEntry[],
  configKey: string,
): PersistedShareStatsState {
  const [persistedStats, updatePersistedStats] = usePersistentState(
    'share_stats',
    configKey,
    createEmptyShareStatsState,
  );

  useEffect(() => {
    if (entries.length === 0) return;

    updatePersistedStats((prev) => {
      let changed = false;
      const next: PersistedShareStatsState = { ...prev };

      entries.forEach((entry) => {
        const current = next[entry.key] ?? {
          acknowledged: 0,
          submitted: 0,
          rejected: 0,
          rejectedByReason: {},
        };
        const rejectedByReason = { ...current.rejectedByReason };

        for (const [reason, count] of Object.entries(entry.rejectedByReason ?? {})) {
          const normalizedCount = Math.max(0, count);
          if ((rejectedByReason[reason] ?? 0) < normalizedCount) {
            rejectedByReason[reason] = normalizedCount;
            changed = true;
          }
        }

        const nextEntry = {
          acknowledged: Math.max(current.acknowledged, Math.max(0, entry.acknowledged)),
          submitted: Math.max(current.submitted, Math.max(0, entry.submitted)),
          rejected: Math.max(current.rejected, Math.max(0, entry.rejected)),
          rejectedByReason,
        };

        if (
          nextEntry.acknowledged !== current.acknowledged ||
          nextEntry.submitted !== current.submitted ||
          nextEntry.rejected !== current.rejected
        ) {
          changed = true;
        }

        next[entry.key] = nextEntry;
      });

      return changed ? next : prev;
    });
  }, [entries, updatePersistedStats]);

  return persistedStats;
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

export function usePersistentShareStats(
  entries: PersistedShareStatsEntry[],
  configKey: string,
): PersistentShareStats {
  const persistedStats = usePersistentShareStatsEntries(entries, configKey);

  return useMemo(() => {
    const rejectedByReason = new Map<string, number>();
    let acknowledged = 0;
    let submitted = 0;
    let rejected = 0;

    Object.values(persistedStats).forEach((entry) => {
      acknowledged += entry.acknowledged;
      submitted += entry.submitted;
      rejected += entry.rejected;

      for (const [reason, count] of Object.entries(entry.rejectedByReason)) {
        rejectedByReason.set(reason, (rejectedByReason.get(reason) ?? 0) + count);
      }
    });

    const rejectionReasons = [...rejectedByReason.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
    const classifiedRejected = rejectionReasons.reduce((sum, item) => sum + item.count, 0);

    return {
      acknowledged,
      submitted,
      rejected,
      rejectionReasons,
      unclassifiedRejected: Math.max(0, rejected - classifiedRejected),
    };
  }, [persistedStats]);
}
