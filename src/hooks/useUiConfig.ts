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

/**
 * Clamp a primary color's lightness so it has enough contrast against
 * the page background in both light and dark mode.
 */
function contrastSafeHsl(h: string, s: string, lVal: number, isDark: boolean): { hsl: string; fgIsWhite: boolean } {
  let l = lVal;
  if (isDark) {
    // Too dark on a black background — boost lightness
    if (l < 30) l = 30;
  } else {
    // Too light on a white background — darken
    if (l > 60) l = 60;
  }
  // Foreground: white for dark primaries, black for light ones
  const fgIsWhite = l < 55;
  return { hsl: `${h} ${s} ${l}%`, fgIsWhite };
}

// Apply runtime CSS variable overrides based on config.
// Adjusts lightness for both light and dark mode to keep contrast safe.
function applyCssVariables(config: UiConfig) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const p = config.primaryColor;

  const parts = p.split(' ');
  if (parts.length < 3) return; // malformed value — CSS sheet defaults remain in effect
  const h = parts[0];
  const s = parts[1];
  const lVal = parseFloat(parts[2]);

  const isDark = root.classList.contains('dark');
  const { hsl: safePrimary, fgIsWhite } = contrastSafeHsl(h, s, lVal, isDark);
  const primaryFg = fgIsWhite ? '0 0% 100%' : '0 0% 0%';

  // Dark mode variant: slightly lighter for better visibility
  const lDark = Math.min(lVal + 5, 100);
  const { hsl: safePrimaryDark, fgIsWhite: fgIsWhiteDark } = contrastSafeHsl(h, s, lDark, true);
  const primaryFgDark = fgIsWhiteDark ? '0 0% 100%' : '0 0% 0%';

  // Override the CSS variables that carry the primary/accent color
  root.style.setProperty('--primary', safePrimary);
  root.style.setProperty('--primary-foreground', primaryFg);
  root.style.setProperty('--ring', safePrimary);
  root.style.setProperty('--sidebar-primary', safePrimary);
  root.style.setProperty('--sidebar-ring', safePrimary);
  root.style.setProperty('--chart-1', safePrimary);
  root.style.setProperty('--cyan-500', safePrimary);

  // For dark mode we inject a <style> that overrides .dark with the boosted lightness.
  const styleId = 'sv2-primary-dark-override';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `.dark { --primary: ${safePrimaryDark}; --primary-foreground: ${primaryFgDark}; --ring: ${safePrimaryDark}; --sidebar-primary: ${safePrimaryDark}; --sidebar-ring: ${safePrimaryDark}; --chart-1: ${safePrimaryDark}; --cyan-500: ${safePrimaryDark}; }`;
}

export function useUiConfig() {
  const [config, setConfig] = useState<UiConfig>(() => loadConfig());
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  // Re-apply CSS variables when theme toggles so contrast clamping updates
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    obs.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    applyCssVariables(config);
    saveConfig(config);
  }, [config, isDark]);

  const updateConfig = (partial: Partial<UiConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  };

  const resetConfig = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setConfig(DEFAULT_CONFIG);
  };

  return { config, updateConfig, resetConfig };
}
