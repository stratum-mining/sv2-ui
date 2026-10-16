import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Sun, Moon } from 'lucide-react';

export function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) { root.classList.add('dark'); localStorage.setItem('theme', 'dark'); }
    else { root.classList.remove('dark'); localStorage.setItem('theme', 'light'); }
  }, [isDark]);
  return { isDark, toggle: () => setIsDark(d => !d) };
}

export function ThemeToggle({ isDark, toggle }: { isDark: boolean; toggle: () => void }) {
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="w-8 h-8 rounded-full hover:bg-accent flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 flex-shrink-0"
    >
      <span className="relative w-4 h-4" aria-hidden="true">
        <Sun className="absolute h-4 w-4 transition-all duration-300 rotate-0 scale-100 dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 transition-all duration-300 rotate-90 scale-0 dark:rotate-0 dark:scale-100" />
      </span>
    </button>
  );
}

interface OnboardingLayoutProps {
  onBack?: () => void;
  progress?: { current: number; total: number };
  stepKey?: string;
  children: ReactNode;
}

export function OnboardingLayout({ onBack, progress, stepKey, children }: OnboardingLayoutProps) {
  const { isDark, toggle } = useTheme();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center px-6 md:px-10 h-14 border-b border-border/40 flex-shrink-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded flex-shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Back</span>
          </button>
        )}

        <div className="flex-1 flex items-center justify-center gap-1.5">
          {progress && (
            <div
              className="flex items-center gap-1.5"
              role="progressbar"
              aria-valuenow={progress.current + 1}
              aria-valuemin={1}
              aria-valuemax={progress.total}
              aria-label={`Step ${progress.current + 1} of ${progress.total}`}
            >
              {Array.from({ length: progress.total }, (_, idx) => (
                <div
                  key={idx}
                  className={`h-1 rounded-full transition-all duration-300 ${idx <= progress.current ? 'bg-primary w-6' : 'bg-border w-6'
                    }`}
                />
              ))}
            </div>
          )}
        </div>

        <ThemeToggle isDark={isDark} toggle={toggle} />
      </div>

      {/* Step content. No overflow here: the page itself must scroll for sticky step actions to stay in view. */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
          <div key={stepKey} className="w-full max-w-xl animate-fade-in-up">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
