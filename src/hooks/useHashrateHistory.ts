import { useEffect, useRef, useState } from 'react';
import { STORAGE_KEYS } from '@/lib/storage-keys';

export interface HashrateDataPoint {
  time: string;
  timestamp: number;
  hashrate: number;
}

export interface ShareDataPoint {
  time: string;
  timestamp: number;
  accepted: number;
  submitted: number;
}

const MAX_HISTORY_POINTS = 60;
const SAMPLE_INTERVAL_MS = 5000;
const MAX_AGE_MS = 30 * 60 * 1000; // prune entries older than 30 min on load

const HASHRATE_KEY = STORAGE_KEYS.HASHRATE_HISTORY;
const SHARE_KEY = STORAGE_KEYS.SHARE_HISTORY;

function loadFromStorage<T extends { timestamp: number }>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: T[] = JSON.parse(raw);
    const cutoff = Date.now() - MAX_AGE_MS;
    return parsed.filter((p) => p.timestamp > cutoff).slice(-MAX_HISTORY_POINTS);
  } catch {
    return [];
  }
}

function saveToStorage<T>(key: string, data: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // storage quota exceeded — silently ignore
  }
}

function timeLabel(now: number): string {
  return new Date(now).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// ─── Hashrate history ────────────────────────────────────────────────────────

export function useHashrateHistory(currentHashrate: number | undefined): HashrateDataPoint[] {
  const [history, setHistory] = useState<HashrateDataPoint[]>(() =>
    loadFromStorage<HashrateDataPoint>(HASHRATE_KEY),
  );

  // Always-current ref so the interval doesn't need to re-register on value changes
  const hashrateRef = useRef<number | undefined>(currentHashrate);
  useEffect(() => {
    hashrateRef.current = currentHashrate;
  }, [currentHashrate]);

  useEffect(() => {
    const id = setInterval(() => {
      const hr = hashrateRef.current;
      if (hr === undefined || hr === null) return;

      const now = Date.now();
      setHistory((prev) => {
        const updated = [...prev, { time: timeLabel(now), timestamp: now, hashrate: hr }].slice(
          -MAX_HISTORY_POINTS,
        );
        saveToStorage(HASHRATE_KEY, updated);
        return updated;
      });
    }, SAMPLE_INTERVAL_MS);

    return () => clearInterval(id);
  }, []); // run once — interval reads latest value via ref

  return history;
}

// ─── Share history ────────────────────────────────────────────────────────────

export function useShareHistory(
  accepted: number | undefined,
  submitted: number | undefined,
): ShareDataPoint[] {
  const [history, setHistory] = useState<ShareDataPoint[]>(() =>
    loadFromStorage<ShareDataPoint>(SHARE_KEY),
  );

  const acceptedRef = useRef<number | undefined>(accepted);
  const submittedRef = useRef<number | undefined>(submitted);
  useEffect(() => {
    acceptedRef.current = accepted;
    submittedRef.current = submitted;
  }, [accepted, submitted]);

  // Null means "not yet initialised" — first tick establishes a baseline
  // without recording a point, preventing a huge spike on the first sample
  // after a page refresh.
  const lastAccepted = useRef<number | null>(null);
  const lastSubmitted = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const acc = acceptedRef.current;
      const sub = submittedRef.current;
      if (acc === undefined || sub === undefined) return;

      if (lastAccepted.current === null) {
        // First tick: set baseline, don't record a point
        lastAccepted.current = acc;
        lastSubmitted.current = sub;
        return;
      }

      const now = Date.now();
      const deltaAccepted = Math.max(0, acc - lastAccepted.current);
      const deltaSubmitted = Math.max(0, sub - (lastSubmitted.current ?? sub));

      lastAccepted.current = acc;
      lastSubmitted.current = sub;

      setHistory((prev) => {
        // Skip leading zero-activity points
        if (prev.length === 0 && deltaSubmitted === 0) return prev;

        const updated = [
          ...prev,
          { time: timeLabel(now), timestamp: now, accepted: deltaAccepted, submitted: deltaSubmitted },
        ].slice(-MAX_HISTORY_POINTS);
        saveToStorage(SHARE_KEY, updated);
        return updated;
      });
    }, SAMPLE_INTERVAL_MS);

    return () => clearInterval(id);
  }, []);

  return history;
}
