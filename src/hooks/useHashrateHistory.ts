import { useEffect, useRef, useState } from 'react';

export interface HashrateDataPoint {
  time: string;
  timestamp: number;
  hashrate: number;
}

const MAX_HISTORY_POINTS = 60; // Keep last 60 data points
const SAMPLE_INTERVAL_MS = 5000; // Sample every 5 seconds
const STORAGE_KEY = 'sv2_hashrate_history';

/**
 * Hook to accumulate hashrate history from real-time data.
 * Since the API doesn't provide historical data, we build it client-side.
 * History is persisted to localStorage so it survives navigation and page refresh.
 * Sampling uses setInterval so the chart updates even when the hashrate value
 * stays numerically constant between polls.
 *
 * @param currentHashrate - The current hashrate value to track
 * @returns Array of historical data points
 */
export function useHashrateHistory(currentHashrate: number | undefined): HashrateDataPoint[] {
  // Load persisted history on first mount
  const [history, setHistory] = useState<HashrateDataPoint[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: HashrateDataPoint[] = JSON.parse(stored);
        // Discard points older than the max history window
        const cutoff = Date.now() - MAX_HISTORY_POINTS * SAMPLE_INTERVAL_MS;
        return parsed.filter(p => p.timestamp > cutoff);
      }
    } catch {
      // Ignore parse errors — start fresh
    }
    return [];
  });

  // Keep a ref so the interval always reads the latest hashrate without
  // needing to restart on every value change.
  const currentHashrateRef = useRef<number | undefined>(currentHashrate);
  currentHashrateRef.current = currentHashrate;

  useEffect(() => {
    // Add a point immediately on mount (no wait for first tick)
    const addPoint = () => {
      const hashrate = currentHashrateRef.current;
      if (hashrate === undefined || hashrate === null) return;

      const now = Date.now();
      const timeStr = new Date(now).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      setHistory(prev => {
        const newPoint: HashrateDataPoint = { time: timeStr, timestamp: now, hashrate };
        const updated = [...prev, newPoint];
        const trimmed = updated.length > MAX_HISTORY_POINTS
          ? updated.slice(-MAX_HISTORY_POINTS)
          : updated;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
        } catch {
          // Ignore storage errors (private browsing quota, etc.)
        }
        return trimmed;
      });
    };

    addPoint(); // Immediate first sample
    const id = setInterval(addPoint, SAMPLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally run once

  return history;
}

/**
 * Hook to accumulate share submission history.
 * Tracks accepted and submitted shares over time.
 */
export interface ShareDataPoint {
  time: string;
  timestamp: number;
  accepted: number;
  submitted: number;
}

export function useShareHistory(
  accepted: number | undefined,
  submitted: number | undefined
): ShareDataPoint[] {
  const [history, setHistory] = useState<ShareDataPoint[]>([]);
  const lastSampleTime = useRef<number>(0);
  const lastAccepted = useRef<number>(0);
  const lastSubmitted = useRef<number>(0);

  useEffect(() => {
    if (accepted === undefined || submitted === undefined) return;

    const now = Date.now();

    // Only add a new sample if enough time has passed
    if (now - lastSampleTime.current < SAMPLE_INTERVAL_MS) return;

    lastSampleTime.current = now;

    const timeStr = new Date(now).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    // Calculate delta (new shares since last sample)
    const deltaAccepted = Math.max(0, accepted - lastAccepted.current);
    const deltaSubmitted = Math.max(0, submitted - lastSubmitted.current);

    lastAccepted.current = accepted;
    lastSubmitted.current = submitted;

    // Only record if there's actual activity (skip initial zero delta)
    if (history.length > 0 || deltaSubmitted > 0) {
      setHistory(prev => {
        const newPoint: ShareDataPoint = {
          time: timeStr,
          timestamp: now,
          accepted: deltaAccepted,
          submitted: deltaSubmitted,
        };

        const updated = [...prev, newPoint];

        if (updated.length > MAX_HISTORY_POINTS) {
          return updated.slice(-MAX_HISTORY_POINTS);
        }

        return updated;
      });
    }
  }, [accepted, submitted, history.length]);

  return history;
}
