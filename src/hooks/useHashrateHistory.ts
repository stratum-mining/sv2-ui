import { useEffect, useRef, useState } from 'react';

export interface HashrateDataPoint {
  time: string;
  timestamp: number;
  hashrate: number;
}

const MAX_HISTORY_POINTS = 60; // Keep last 60 data points
const SAMPLE_INTERVAL_MS = 5000; // Sample every 5 seconds

/**
 * Hook to accumulate hashrate history from real-time data.
 * Since the API doesn't provide historical data, we build it client-side.
 * 
 * @param currentHashrate - The current hashrate value to track
 * @returns Array of historical data points
 */
export function useHashrateHistory(currentHashrate: number | undefined): HashrateDataPoint[] {
  const [history, setHistory] = useState<HashrateDataPoint[]>([]);
  const lastSampleTime = useRef<number>(0);

  useEffect(() => {
    if (currentHashrate === undefined || currentHashrate === null) return;

    const now = Date.now();
    
    // Only add a new sample if enough time has passed
    if (now - lastSampleTime.current < SAMPLE_INTERVAL_MS) return;
    
    lastSampleTime.current = now;
    
    const timeStr = new Date(now).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    setHistory(prev => {
      const newPoint: HashrateDataPoint = {
        time: timeStr,
        timestamp: now,
        hashrate: currentHashrate,
      };
      
      const updated = [...prev, newPoint];
      
      // Keep only the last MAX_HISTORY_POINTS
      if (updated.length > MAX_HISTORY_POINTS) {
        return updated.slice(-MAX_HISTORY_POINTS);
      }
      
      return updated;
    });
  }, [currentHashrate]);

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
