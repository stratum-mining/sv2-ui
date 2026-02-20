import { useEffect, useState } from 'react';

type UiConfig = {
  // Stored as HSL triplet string, e.g. '190 100% 45%'
  primaryColor: string;
  // Base64 data URL for custom logo, or '' for default
  customLogoDataUrl: string;
};

const STORAGE_KEY = 'sv2-ui-config';

const DEFAULT_CONFIG: UiConfig = {
  // Cyan — matches --primary in index.css light mode
  primaryColor: '190 100% 45%',
  customLogoDataUrl: '',
};

function loadConfig(): UiConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<UiConfig>;
    return {
      primaryColor: (typeof parsed.primaryColor === 'string' && parsed.primaryColor)
        ? parsed.primaryColor
        : DEFAULT_CONFIG.primaryColor,
      customLogoDataUrl: typeof parsed.customLogoDataUrl === 'string'
        ? parsed.customLogoDataUrl
        : DEFAULT_CONFIG.customLogoDataUrl,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config: UiConfig) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

// Apply runtime CSS variable overrides based on config.
// Slightly boosts lightness for dark mode primary (+5% L).
function applyCssVariables(config: UiConfig) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const p = config.primaryColor;

  // Parse HSL to compute a slightly lighter dark-mode variant
  const parts = p.split(' ');
  if (parts.length < 3) return; // malformed value — CSS sheet defaults remain in effect
  const h = parts[0];
  const s = parts[1];
  const lVal = parseFloat(parts[2]);
  const lDark = Math.min(lVal + 5, 100);
  const pDark = `${h} ${s} ${lDark}%`;

  // Override the CSS variables that carry the primary/accent cyan
  // Using !important-style inline styles on :root (inline > stylesheet)
  root.style.setProperty('--primary', p);
  root.style.setProperty('--ring', p);
  root.style.setProperty('--sidebar-primary', p);
  root.style.setProperty('--sidebar-ring', p);
  root.style.setProperty('--chart-1', p);
  root.style.setProperty('--cyan-500', p);

  // For dark mode we inject a <style> that overrides .dark with the boosted lightness.
  // We key the element by id so we only ever have one.
  const styleId = 'sv2-primary-dark-override';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `.dark { --primary: ${pDark}; --ring: ${pDark}; --sidebar-primary: ${pDark}; --sidebar-ring: ${pDark}; --chart-1: ${pDark}; --cyan-500: ${pDark}; }`;
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

  const resetConfig = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setConfig(DEFAULT_CONFIG);
  };

  return { config, updateConfig, resetConfig };
}
