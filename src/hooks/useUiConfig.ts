import { useEffect, useState } from 'react';

type UiConfig = {
  appName: string;
  // Stored as HSL triplet string, e.g. '240 5% 96%'
  secondary: string;
};

const STORAGE_KEY = 'sv2-ui-config';

const DEFAULT_CONFIG: UiConfig = {
  appName: 'SV2 Mining Stack',
  secondary: '0 0% 96%',
};

function loadConfig(): UiConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<UiConfig>;
    return {
      appName: parsed.appName || DEFAULT_CONFIG.appName,
      secondary: parsed.secondary || DEFAULT_CONFIG.secondary,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config: UiConfig) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

// Apply runtime CSS variable overrides based on config
function applyCssVariables(config: UiConfig) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  // Ensure sidebar base color comes from CSS theme, not overrides
  root.style.removeProperty('--sidebar');

  // Drive secondary-like surfaces from a single configurable color
  root.style.setProperty('--secondary', config.secondary);
  root.style.setProperty('--muted', config.secondary);
  root.style.setProperty('--accent', config.secondary);
  // Only tint the sidebar entry backgrounds, not the whole sidebar
  root.style.setProperty('--sidebar-accent', config.secondary);
}

export function useUiConfig() {
  const [config, setConfig] = useState<UiConfig>(() => loadConfig());

  useEffect(() => {
    applyCssVariables(config);
    saveConfig(config);
  }, [config]);

  const updateConfig = (partial: Partial<UiConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  };

  return { config, updateConfig };
}

