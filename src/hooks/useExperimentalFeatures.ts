import { useCallback, useEffect, useState } from 'react';

export interface ExperimentalFeatures {
  benchmark: boolean;
}

const STORAGE_KEY = 'sv2-ui-experimental-features';
const CHANGE_EVENT = 'sv2-ui-experimental-features-change';
const DEFAULT_FEATURES: ExperimentalFeatures = {
  benchmark: false,
};

export function normalizeExperimentalFeatures(value: unknown): ExperimentalFeatures {
  if (!value || typeof value !== 'object') return DEFAULT_FEATURES;

  return {
    benchmark: (value as Partial<ExperimentalFeatures>).benchmark === true,
  };
}

function readExperimentalFeatures(): ExperimentalFeatures {
  if (typeof window === 'undefined') return DEFAULT_FEATURES;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? normalizeExperimentalFeatures(JSON.parse(stored)) : DEFAULT_FEATURES;
  } catch {
    return DEFAULT_FEATURES;
  }
}

function storeExperimentalFeatures(features: ExperimentalFeatures): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(features));
  } catch {
    // Keep the in-memory state usable if browser storage is unavailable.
  }
}

export function useExperimentalFeatures() {
  const [features, setFeatures] = useState<ExperimentalFeatures>(readExperimentalFeatures);

  useEffect(() => {
    const syncFeatures = () => setFeatures(readExperimentalFeatures());

    window.addEventListener('storage', syncFeatures);
    window.addEventListener(CHANGE_EVENT, syncFeatures);

    return () => {
      window.removeEventListener('storage', syncFeatures);
      window.removeEventListener(CHANGE_EVENT, syncFeatures);
    };
  }, []);

  const setFeature = useCallback(
    (feature: keyof ExperimentalFeatures, enabled: boolean) => {
      const nextFeatures = {
        ...readExperimentalFeatures(),
        [feature]: enabled,
      };

      storeExperimentalFeatures(nextFeatures);
      setFeatures(nextFeatures);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [],
  );

  return { features, setFeature };
}
