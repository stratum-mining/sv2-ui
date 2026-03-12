import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import { SetupWizard } from '@/components/setup/SetupWizard';

function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  return { isDark, toggle: () => setIsDark(!isDark) };
}

/**
 * Setup page - guides users through initial configuration.
 *
 * Two modes:
 * - JD (Job Declaration): Miner runs Bitcoin node and creates own block templates
 *   Components: JDC + Translator Proxy
 *
 * - No-JD: Miner uses pool's templates directly
 *   Components: Translator Proxy only
 */
export function Setup() {
  const { toggle } = useTheme();

  return (
    <div className="min-h-screen bg-background">
      <button
        onClick={toggle}
        aria-label="Toggle theme"
        className="fixed top-4 right-4 z-50 w-10 h-10 flex items-center justify-center rounded-full bg-background/50 backdrop-blur-sm border border-border/50 shadow-sm hover:bg-accent transition-colors"
      >
        <span className="relative w-4 h-4">
          <Sun className="absolute h-4 w-4 transition-all duration-300 rotate-0 scale-100 dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 transition-all duration-300 rotate-90 scale-0 dark:rotate-0 dark:scale-100" />
        </span>
      </button>
      <SetupWizard />
    </div>
  );
}
