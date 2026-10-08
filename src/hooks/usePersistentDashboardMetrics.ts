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

type ShareCounts = {
  acknowledged: number;
  submitted: number;
  rejected: number;
  rejectedByReason: Record<string, number>;
};

// Totals per channel, plus the channel's live counters at the last update.
// Live counters start from 0 again when the mining stack restarts, usually
// under the same channel key, so they can't be stored as the total.
type PersistedShareStatsState = Record<string, ShareCounts & { live?: ShareCounts }>;

// Blocks found per channel: the total and the live counter last seen.
type PersistedCounterState = Record<string, { total: number; live: number }>;

function storageKeyFor(metricKey: string, configKey: string): string {
  return `sv2_${metricKey}:${configKey}`;
}

function createEmptyMetricState(): PersistedMetricState {
  return {};
}

function createEmptyShareStatsState(): PersistedShareStatsState {
  return {};
}

function createEmptyCounterState(): PersistedCounterState {
  return {};
}

/**
 * How much a live counter grew since it was last seen. A live counter only
 * goes down when its channel started over (a restart), and then all of it is
 * new.
 */
function counterIncrease(live: number, lastLive: number, restarted: boolean): number {
  return restarted ? live : Math.max(0, live - lastLive);
}

const MAX_SHARE_STATS_ENTRIES = 256;
const MAX_REJECTION_REASONS = 32;
const MAX_ENTRY_KEY_LENGTH = 256;
const MAX_REASON_LENGTH = 128;
const MAX_SHARE_STATS_STORAGE_LENGTH = 2 * 1024 * 1024;

// Reserved bucket that absorbs entries evicted under the entry-count cap so
// lifetime totals can never decrease. Cumulative counters (blocks_found) bank
// additively; best_difficulty banks a running maximum.
export const AGGREGATE_KEY = '@@evicted@@';

function normalizeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

// Keeps at most MAX_REJECTION_REASONS labels of at most MAX_REASON_LENGTH
// characters, preferring the highest counts (the display sorts by count too).
function clampReasons(reasons: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(reasons)
      .filter(([reason]) => reason.length <= MAX_REASON_LENGTH)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_REJECTION_REASONS),
  );
}

// Stable, synchronous, dependency-free hash so telemetry-derived keys that
// exceed the key-length bound can still be persisted (instead of dropped)
// under a short, predictable key.
function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function normalizeMetricKey(key: string): string {
  return key === AGGREGATE_KEY || key.length <= MAX_ENTRY_KEY_LENGTH
    ? key
    : `h:${hashString(key)}`;
}

function normalizeMetricState(value: unknown): PersistedMetricState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createEmptyMetricState();
  }

  const source = value as Record<string, unknown>;
  const normalized: PersistedMetricState = {};

  // Preserve the aggregate bucket so lifetime totals never decrease.
  const aggregate = source[AGGREGATE_KEY];
  if (typeof aggregate === 'number' && Number.isFinite(aggregate)) {
    normalized[AGGREGATE_KEY] = Math.max(0, aggregate);
  }

  const entries = Object.entries(source)
    .filter(([key]) => key !== AGGREGATE_KEY)
    .slice(-MAX_SHARE_STATS_ENTRIES);

  entries.forEach(([key, val]) => {
    const normalizedKey = normalizeMetricKey(key);
    if (normalizedKey === AGGREGATE_KEY) return;
    const normalizedValue = normalizeCount(val);
    if (!(normalizedKey in normalized) || normalized[normalizedKey] < normalizedValue) {
      normalized[normalizedKey] = normalizedValue;
    }
  });

  return normalized;
}

function normalizeShareStatsState(value: unknown): PersistedShareStatsState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createEmptyShareStatsState();
  }

  const source = value as Record<string, unknown>;
  const normalized: PersistedShareStatsState = {};

  // Preserve the aggregate bucket so lifetime totals never decrease.
  const storedAggregate = source[AGGREGATE_KEY];
  if (
    storedAggregate &&
    typeof storedAggregate === 'object' &&
    !Array.isArray(storedAggregate)
  ) {
    const agg = storedAggregate as Record<string, unknown>;
    const storedReasons = agg.rejectedByReason;
    normalized[AGGREGATE_KEY] = {
      acknowledged: normalizeCount(agg.acknowledged),
      submitted: normalizeCount(agg.submitted),
      rejected: normalizeCount(agg.rejected),
      rejectedByReason:
        storedReasons && typeof storedReasons === 'object' && !Array.isArray(storedReasons)
          ? clampReasons(
              Object.fromEntries(
                Object.entries(storedReasons as Record<string, unknown>).map(([reason, count]) => [
                  reason,
                  normalizeCount(count),
                ]),
              ),
            )
          : {},
    };
  }

  const entries = Object.entries(source)
    .filter(([key]) => key !== AGGREGATE_KEY)
    .slice(-MAX_SHARE_STATS_ENTRIES);

  entries.forEach(([key, entry]) => {
    const normalizedKey = normalizeMetricKey(key);
    if (normalizedKey === AGGREGATE_KEY) return;

    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return;
    }

    const storedEntry = entry as Record<string, unknown>;
    const storedReasons = storedEntry.rejectedByReason;
    const rejectedByReason =
      storedReasons && typeof storedReasons === 'object' && !Array.isArray(storedReasons)
        ? Object.fromEntries(
            Object.entries(storedReasons)
              .filter(([reason]) => reason.length <= MAX_REASON_LENGTH)
              .slice(-MAX_REJECTION_REASONS)
              .map(([reason, count]) => [reason, normalizeCount(count)]),
          )
        : {};

    const totals = {
      acknowledged: normalizeCount(storedEntry.acknowledged),
      submitted: normalizeCount(storedEntry.submitted),
      rejected: normalizeCount(storedEntry.rejected),
      rejectedByReason,
    };
    const storedLive = storedEntry.live;
    normalized[normalizedKey] = storedLive && typeof storedLive === 'object' && !Array.isArray(storedLive)
      ? { ...totals, live: normalizeShareCounts(storedLive as Record<string, unknown>) }
      : totals;
  });

  return normalized;
}

function normalizeShareCounts(source: Record<string, unknown>): ShareCounts {
  const reasons = source.rejectedByReason;
  return {
    acknowledged: normalizeCount(source.acknowledged),
    submitted: normalizeCount(source.submitted),
    rejected: normalizeCount(source.rejected),
    rejectedByReason:
      reasons && typeof reasons === 'object' && !Array.isArray(reasons)
        ? clampReasons(
            Object.fromEntries(
              Object.entries(reasons as Record<string, unknown>).map(([reason, count]) => [
                reason,
                normalizeCount(count),
              ]),
            ),
          )
        : {},
  };
}

// Older saves hold plain numbers: the highest value seen, which is also the
// live counter of the run it came from.
function normalizeCounterState(value: unknown): PersistedCounterState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createEmptyCounterState();
  }

  const read = (stored: unknown) => {
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      const entry = stored as Record<string, unknown>;
      return { total: normalizeCount(entry.total), live: normalizeCount(entry.live) };
    }
    const count = normalizeCount(stored);
    return { total: count, live: count };
  };

  const source = value as Record<string, unknown>;
  const normalized: PersistedCounterState = {};
  if (AGGREGATE_KEY in source) {
    normalized[AGGREGATE_KEY] = { total: read(source[AGGREGATE_KEY]).total, live: 0 };
  }

  Object.entries(source)
    .filter(([key]) => key !== AGGREGATE_KEY)
    .slice(-MAX_SHARE_STATS_ENTRIES)
    .forEach(([key, stored]) => {
      const normalizedKey = normalizeMetricKey(key);
      if (normalizedKey === AGGREGATE_KEY) return;
      normalized[normalizedKey] = read(stored);
    });

  return normalized;
}

// Pure merge used by usePersistentBestDifficulty. Bounds key length (via
// hashing), normalizes values, and enforces the entry-count cap by moving
// evicted per-key maxima into the aggregate bucket, which keeps a running
// maximum so the displayed best never decreases.
export function mergeMetricEntries(
  prev: PersistedMetricState,
  entries: PersistedMetricEntry[],
): { next: PersistedMetricState; changed: boolean } {
  let changed = false;
  const next: PersistedMetricState = { ...prev };

  const boundedEntries = entries
    .map((entry) => ({ key: normalizeMetricKey(entry.key), value: entry.value }))
    .filter((entry) => entry.key !== AGGREGATE_KEY);
  const liveKeys = new Set(boundedEntries.map((entry) => entry.key));

  boundedEntries.forEach(({ key, value }) => {
    const normalizedValue = Math.max(0, value);
    if ((next[key] ?? 0) < normalizedValue) {
      next[key] = normalizedValue;
      changed = true;
    }
  });

  const evictable = Object.keys(next).filter((k) => k !== AGGREGATE_KEY);
  while (evictable.length > MAX_SHARE_STATS_ENTRIES) {
    // Prefer entries that are no longer reported.
    const victim = evictable.find((k) => !liveKeys.has(k)) ?? evictable[0];
    next[AGGREGATE_KEY] = Math.max(next[AGGREGATE_KEY] ?? 0, next[victim] ?? 0);
    delete next[victim];
    evictable.splice(evictable.indexOf(victim), 1);
    changed = true;
  }

  return { next, changed };
}

// Pure merge used by usePersistentBlocksFound. Adds each channel's new blocks
// to its total, counting a restarted channel from 0. Evicted entries under the
// entry-count cap are added to the aggregate bucket; entries the current
// snapshot itself just created are never banked, otherwise re-supplying the
// same over-cap snapshot would inflate totals on every merge.
export function mergeCounterEntries(
  prev: PersistedCounterState,
  entries: PersistedMetricEntry[],
): { next: PersistedCounterState; changed: boolean } {
  let changed = false;
  const next: PersistedCounterState = { ...prev };

  const boundedEntries = entries
    .map((entry) => ({ key: normalizeMetricKey(entry.key), value: Math.max(0, entry.value) }))
    .filter((entry) => entry.key !== AGGREGATE_KEY);
  const liveKeys = new Set(boundedEntries.map((entry) => entry.key));
  const createdKeys = new Set(
    boundedEntries.filter(({ key }) => !(key in prev)).map(({ key }) => key),
  );

  boundedEntries.forEach(({ key, value }) => {
    const current = next[key] ?? { total: 0, live: 0 };
    if (value === current.live) return;
    next[key] = {
      total: current.total + counterIncrease(value, current.live, value < current.live),
      live: value,
    };
    changed = true;
  });

  const evictable = Object.keys(next).filter((k) => k !== AGGREGATE_KEY);
  while (evictable.length > MAX_SHARE_STATS_ENTRIES) {
    // Prefer entries that are no longer reported, then entries the current
    // snapshot itself just created, and only then established live entries.
    const victim =
      evictable.find((k) => !liveKeys.has(k)) ??
      evictable.find((k) => createdKeys.has(k)) ??
      evictable[0];
    const freshlyCreatedLive = liveKeys.has(victim) && createdKeys.has(victim);
    if (!freshlyCreatedLive && (next[victim]?.total ?? 0) > 0) {
      next[AGGREGATE_KEY] = {
        total: (next[AGGREGATE_KEY]?.total ?? 0) + next[victim].total,
        live: 0,
      };
    }
    delete next[victim];
    evictable.splice(evictable.indexOf(victim), 1);
    changed = true;
  }

  return { next, changed };
}

// Pure merge used by usePersistentShareStatsEntries. Bounds key length (via
// hashing, instead of silently dropping) and enforces the entry-count cap by
// folding evicted counts into the aggregate share-stats bucket. Entries the
// current snapshot itself just created are never banked, otherwise repeatedly
// re-supplying the same over-cap snapshot would inflate totals. The aggregate
// rejection-reason map stays within the reason-count/length bounds.
export function mergeShareStatsEntries(
  prev: PersistedShareStatsState,
  entries: PersistedShareStatsEntry[],
): { next: PersistedShareStatsState; changed: boolean } {
  let changed = false;
  const next: PersistedShareStatsState = { ...prev };

  const boundedEntries = entries
    .map((entry) => ({ ...entry, key: normalizeMetricKey(entry.key) }))
    .filter((entry) => entry.key !== AGGREGATE_KEY);
  const incomingEntryKeys = new Set(boundedEntries.map((entry) => entry.key));
  const createdKeys = new Set(
    boundedEntries.filter(({ key }) => !(key in prev)).map(({ key }) => key),
  );

  boundedEntries.forEach((entry) => {
    const current = next[entry.key] ?? {
      acknowledged: 0,
      submitted: 0,
      rejected: 0,
      rejectedByReason: {},
    };
    // Older saves have no live counters: their totals are the highest values
    // seen, which are also the live counters of the run they came from.
    const lastLive = current.live ?? current;
    const live: ShareCounts = {
      acknowledged: Math.max(0, entry.acknowledged),
      submitted: Math.max(0, entry.submitted),
      rejected: Math.max(0, entry.rejected),
      rejectedByReason: Object.fromEntries(
        Object.entries(entry.rejectedByReason ?? {})
          .filter(([reason]) => reason.length <= MAX_REASON_LENGTH)
          .slice(-MAX_REJECTION_REASONS)
          .map(([reason, count]) => [reason, Math.max(0, count)]),
      ),
    };
    const restarted =
      live.acknowledged < lastLive.acknowledged ||
      live.submitted < lastLive.submitted ||
      live.rejected < lastLive.rejected;

    const rejectedByReason = { ...current.rejectedByReason };
    for (const [reason, count] of Object.entries(live.rejectedByReason)) {
      const added = counterIncrease(count, lastLive.rejectedByReason[reason] ?? 0, restarted);
      if (added > 0) rejectedByReason[reason] = (rejectedByReason[reason] ?? 0) + added;
    }

    const nextEntry = {
      acknowledged: current.acknowledged + counterIncrease(live.acknowledged, lastLive.acknowledged, restarted),
      submitted: current.submitted + counterIncrease(live.submitted, lastLive.submitted, restarted),
      rejected: current.rejected + counterIncrease(live.rejected, lastLive.rejected, restarted),
      rejectedByReason: clampReasons(rejectedByReason),
      live,
    };

    if (JSON.stringify(nextEntry) !== JSON.stringify(current)) changed = true;
    next[entry.key] = nextEntry;
  });

  const evictable = Object.keys(next).filter((k) => k !== AGGREGATE_KEY);
  while (evictable.length > MAX_SHARE_STATS_ENTRIES) {
    // Prefer entries that are no longer reported, then entries the current
    // snapshot itself just created, and only then established live entries.
    const victim =
      evictable.find((k) => !incomingEntryKeys.has(k)) ??
      evictable.find((k) => createdKeys.has(k)) ??
      evictable[0];
    const freshlyCreatedLive = incomingEntryKeys.has(victim) && createdKeys.has(victim);
    if (!freshlyCreatedLive) {
      const aggregate = next[AGGREGATE_KEY] ?? {
        acknowledged: 0,
        submitted: 0,
        rejected: 0,
        rejectedByReason: {},
      };
      const evicted = next[victim];
      if (evicted) {
        aggregate.acknowledged += evicted.acknowledged;
        aggregate.submitted += evicted.submitted;
        aggregate.rejected += evicted.rejected;
        for (const [reason, count] of Object.entries(evicted.rejectedByReason)) {
          aggregate.rejectedByReason[reason] = (aggregate.rejectedByReason[reason] ?? 0) + count;
        }
        aggregate.rejectedByReason = clampReasons(aggregate.rejectedByReason);
        next[AGGREGATE_KEY] = aggregate;
      }
    }
    delete next[victim];
    evictable.splice(evictable.indexOf(victim), 1);
    changed = true;
  }

  return { next, changed };
}

function loadFromStorage<T>(
  metricKey: string,
  configKey: string,
  createInitialState: () => T,
  normalizeState?: (value: unknown) => T,
  maxStoredLength = Number.POSITIVE_INFINITY,
): T {
  try {
    const stored = localStorage.getItem(storageKeyFor(metricKey, configKey));
    if (stored) {
      if (stored.length > maxStoredLength) return createInitialState();
      const parsed = JSON.parse(stored) as unknown;
      return normalizeState ? normalizeState(parsed) : (parsed as T);
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
  normalizeState?: (value: unknown) => T,
  maxStoredLength?: number,
): [T, (updater: (prev: T) => T) => void] {
  const [state, setState] = useState<T>(
    () => loadFromStorage(metricKey, configKey, createInitialState, normalizeState, maxStoredLength),
  );

  const storageKeyRef = useRef<string>(storageKeyFor(metricKey, configKey));

  useEffect(() => {
    storageKeyRef.current = storageKeyFor(metricKey, configKey);
    setState(loadFromStorage(metricKey, configKey, createInitialState, normalizeState, maxStoredLength));
  }, [configKey, metricKey, createInitialState, maxStoredLength, normalizeState]);

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
): PersistedMetricState {
  const [persistedCounts, updatePersistedCounts] = usePersistentState(
    'best_diff',
    configKey,
    createEmptyMetricState,
    normalizeMetricState,
    MAX_SHARE_STATS_STORAGE_LENGTH,
  );

  useEffect(() => {
    if (entries.length === 0) return;

    updatePersistedCounts((prev) => {
      const { next, changed } = mergeMetricEntries(prev, entries);
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
    normalizeShareStatsState,
    MAX_SHARE_STATS_STORAGE_LENGTH,
  );

  useEffect(() => {
    if (entries.length === 0) return;

    updatePersistedStats((prev) => {
      const { next, changed } = mergeShareStatsEntries(prev, entries);
      return changed ? next : prev;
    });
  }, [entries, updatePersistedStats]);

  return persistedStats;
}

export function usePersistentBlocksFound(
  entries: PersistedMetricEntry[],
  configKey: string,
): number {
  const [persistedCounts, updatePersistedCounts] = usePersistentState(
    'blocks_found',
    configKey,
    createEmptyCounterState,
    normalizeCounterState,
    MAX_SHARE_STATS_STORAGE_LENGTH,
  );

  useEffect(() => {
    if (entries.length === 0) return;

    updatePersistedCounts((prev) => {
      const { next, changed } = mergeCounterEntries(prev, entries);
      return changed ? next : prev;
    });
  }, [entries, updatePersistedCounts]);

  return useMemo(
    () => Object.values(persistedCounts).reduce((sum, { total }) => sum + total, 0),
    [persistedCounts],
  );
}

export function usePersistentBestDifficulty(
  entries: PersistedMetricEntry[],
  configKey: string,
): number {
  const persistedCounts = usePersistentMetric(entries, configKey);

  return useMemo(
    // The aggregate bucket holds the running maximum of evicted entries, so
    // including it keeps the displayed best difficulty from ever decreasing.
    () => Object.values(persistedCounts).reduce((max, value) => Math.max(max, value), 0),
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
