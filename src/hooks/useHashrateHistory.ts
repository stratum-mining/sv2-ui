import { useEffect, useRef, useState } from 'react';

export interface HashrateDataPoint {
  time: string;
  timestamp: number;
  hashrate: number;
  powerW?: number | null;
  efficiencyJTh?: number | null;
  temperatureC?: number | null;
}

const MAX_HISTORY_POINTS = 720; // Keep up to 1 hour of data (at 5-second intervals)
const SAMPLE_INTERVAL_MS = 5000; // Sample every 5 seconds

function storageKeyFor(configKey: string): string {
  return `sv2_hashrate_history:${configKey}`;
}

function loadFromStorage(configKey: string): HashrateDataPoint[] {
  try {
    const stored = localStorage.getItem(storageKeyFor(configKey));
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
}

/**
 * Hook to accumulate hashrate history from real-time data.
 * Since the API doesn't provide historical data, we build it client-side.
 *
 * History is persisted to localStorage and scoped to the active mining
 * configuration (configKey), so stale samples from a previous pool or mode
 * are never shown after a reconfigure.
 *
 * Sampling uses setInterval so the chart updates even when the hashrate value
 * stays numerically constant between polls.
 *
 * @param currentHashrate - The current hashrate value to track
 * @param configKey       - Stable string identifying the active config
 *                          (e.g. "jd:Braiins Pool"). Pass "default" when
 *                          the config is not yet known.
 * @returns Array of historical data points
 */
export function useHashrateHistory(
  currentHashrate: number | undefined,
  configKey: string,
  telemetry?: {
    powerW?: number | null;
    efficiencyJTh?: number | null;
    temperatureC?: number | null;
  },
): HashrateDataPoint[] {
  const [history, setHistory] = useState<HashrateDataPoint[]>(
    () => loadFromStorage(configKey),
  );

  // Keep a ref so the interval always reads the latest values without
  // needing to restart on every change.
  const currentHashrateRef = useRef<number | undefined>(currentHashrate);
  currentHashrateRef.current = currentHashrate;
  const telemetryRef = useRef<typeof telemetry>(telemetry);
  telemetryRef.current = telemetry;

  const storageKeyRef = useRef<string>(storageKeyFor(configKey));

  // When the active config changes, swap to the matching history slice.
  useEffect(() => {
    storageKeyRef.current = storageKeyFor(configKey);
    setHistory(loadFromStorage(configKey));
  }, [configKey]);

  // Fixed-interval sampler — runs once for the lifetime of the component.
  useEffect(() => {
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
        const telemetry = telemetryRef.current;
        const newPoint: HashrateDataPoint = {
          time: timeStr,
          timestamp: now,
          hashrate,
          powerW: telemetry?.powerW ?? null,
          efficiencyJTh: telemetry?.efficiencyJTh ?? null,
          temperatureC: telemetry?.temperatureC ?? null,
        };
        const updated = [...prev, newPoint];
        const trimmed = updated.length > MAX_HISTORY_POINTS
          ? updated.slice(-MAX_HISTORY_POINTS)
          : updated;
        try {
          localStorage.setItem(storageKeyRef.current, JSON.stringify(trimmed));
        } catch {
          // Ignore storage errors (private browsing quota, etc.)
        }
        return trimmed;
      });
    };

    addPoint(); // Immediate first sample on mount
    const id = setInterval(addPoint, SAMPLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

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
