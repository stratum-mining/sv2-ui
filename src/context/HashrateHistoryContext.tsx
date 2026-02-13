import { createContext, useContext, useReducer, useEffect, useRef, type ReactNode } from 'react';

export interface HashrateDataPoint {
  time: string;
  timestamp: number;
  hashrate: number;
}

const MAX_HISTORY_POINTS = 60; // Keep last 60 data points
const SAMPLE_INTERVAL_MS = 5000; // Sample every 5 seconds
const STORAGE_KEY = 'sv2-hashrate-history';
const MAX_AGE_MS = 60 * 60 * 1000; // Discard data older than 1 hour

// State
interface HashrateHistoryState {
  history: HashrateDataPoint[];
}

// Actions
type HashrateHistoryAction = 
  | { type: 'ADD_POINT'; payload: HashrateDataPoint }
  | { type: 'LOAD'; payload: HashrateDataPoint[] }
  | { type: 'CLEAR' };

// Load initial state from localStorage
function loadInitialState(): HashrateHistoryState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored) as HashrateDataPoint[];
      const now = Date.now();
      // Filter out data older than MAX_AGE_MS
      const recentData = data.filter(point => now - point.timestamp < MAX_AGE_MS);
      return { history: recentData.slice(-MAX_HISTORY_POINTS) };
    }
  } catch {
    // Ignore errors, start with empty state
  }
  return { history: [] };
}

// Reducer
function hashrateHistoryReducer(
  state: HashrateHistoryState, 
  action: HashrateHistoryAction
): HashrateHistoryState {
  switch (action.type) {
    case 'ADD_POINT': {
      const updated = [...state.history, action.payload];
      return {
        history: updated.length > MAX_HISTORY_POINTS 
          ? updated.slice(-MAX_HISTORY_POINTS) 
          : updated,
      };
    }
    case 'LOAD':
      return { history: action.payload };
    case 'CLEAR':
      return { history: [] };
    default:
      return state;
  }
}

// Context
interface HashrateHistoryContextValue {
  history: HashrateDataPoint[];
  addPoint: (hashrate: number) => void;
  clear: () => void;
}

const HashrateHistoryContext = createContext<HashrateHistoryContextValue | null>(null);

// Provider
interface HashrateHistoryProviderProps {
  children: ReactNode;
}

export function HashrateHistoryProvider({ children }: HashrateHistoryProviderProps) {
  const [state, dispatch] = useReducer(hashrateHistoryReducer, undefined, loadInitialState);
  const lastSampleTime = useRef<number>(0);

  // Persist to localStorage whenever history changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history));
    } catch {
      // Ignore storage errors (e.g., quota exceeded)
    }
  }, [state.history]);

  const addPoint = (hashrate: number) => {
    const now = Date.now();
    
    // Only add a new sample if enough time has passed
    if (now - lastSampleTime.current < SAMPLE_INTERVAL_MS) return;
    
    lastSampleTime.current = now;
    
    const timeStr = new Date(now).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    dispatch({
      type: 'ADD_POINT',
      payload: {
        time: timeStr,
        timestamp: now,
        hashrate,
      },
    });
  };

  const clear = () => {
    dispatch({ type: 'CLEAR' });
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  };

  return (
    <HashrateHistoryContext.Provider value={{ history: state.history, addPoint, clear }}>
      {children}
    </HashrateHistoryContext.Provider>
  );
}

// Hook to consume context
export function useHashrateHistoryContext() {
  const context = useContext(HashrateHistoryContext);
  if (!context) {
    throw new Error('useHashrateHistoryContext must be used within HashrateHistoryProvider');
  }
  return context;
}

/**
 * Hook to record hashrate data points.
 * Call this from the dashboard to continuously record hashrate.
 * The data persists across tab switches.
 */
export function useRecordHashrate(currentHashrate: number | undefined) {
  const { addPoint } = useHashrateHistoryContext();

  useEffect(() => {
    if (currentHashrate !== undefined && currentHashrate !== null) {
      addPoint(currentHashrate);
    }
  }, [currentHashrate, addPoint]);
}

/**
 * Hook to get the hashrate history.
 * Use this to display the chart.
 */
export function useHashrateHistory(): HashrateDataPoint[] {
  const { history } = useHashrateHistoryContext();
  return history;
}
