import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard,
  Settings,
  Sun,
  Moon,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConnectionStatus, getConnectionState } from '@/components/data/ConnectionStatus';
import { useTranslatorHealth, useJdcHealth } from '@/hooks/usePoolData';
import type { AppMode, AppFeatures } from '@/types/api';
import { getAppFeatures } from '@/types/api';

// Theme hook
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

interface ShellProps {
  children: React.ReactNode;
  appMode?: AppMode;
  appName?: string;
}

/**
 * Main application shell with sidebar navigation.
 * Matches Replit UI styling - sidebar-glass effect.
 */
export function Shell({
  children,
  appMode = 'translator',
  appName = 'SV2 Monitor',
}: ShellProps) {
  const [location] = useLocation();
  const { isDark, toggle } = useTheme();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  
  // Check health of both services
  const { data: translatorOk, isLoading: translatorLoading } = useTranslatorHealth();
  const { data: jdcOk, isLoading: jdcLoading } = useJdcHealth();
  
  // Consider connected if at least one service is available
  const isLoading = translatorLoading && jdcLoading;
  const isSuccess = Boolean(translatorOk || jdcOk);
  const isError = !isLoading && !isSuccess;
  
  const features = getAppFeatures(appMode);

  const navItems = getNavItems(features, appMode);

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans transition-colors duration-300">
      {/* Mobile Nav Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 md:relative md:translate-x-0',
          'sidebar-glass',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo Area */}
          <div className="flex h-14 items-center px-6 border-b border-sidebar-border">
            <Link href="/">
              <img
                src="/sv2-logo-240x40.png"
                srcSet="/sv2-logo-240x40.png 1x, /sv2-logo-480x80.png 2x"
                alt="Stratum V2"
                width="140"
                height="23"
                className="h-[23px] w-auto cursor-pointer"
                style={isDark ? undefined : { filter: 'brightness(0.3)' }}
              />
            </Link>
            <button
              className="md:hidden ml-auto p-1 hover:bg-muted/50 rounded"
              onClick={() => setIsMobileOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navItems.map((item) => {
              const isActive =
                location === item.href ||
                (item.href !== '/' && location.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      'group flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 mb-1 cursor-pointer',
                      isActive
                        ? 'bg-primary/10 text-primary shadow-sm'
                        : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                    )}
                  >
                    <item.icon
                      className={cn(
                        'mr-3 h-4 w-4 transition-colors',
                        isActive
                          ? 'text-primary'
                          : 'text-muted-foreground group-hover:text-foreground'
                      )}
                    />
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-border" />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background relative">
        {/* Mobile Top Bar */}
        <div className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
          <button
            className="p-2 hover:bg-muted/50 rounded-lg transition-colors"
            onClick={() => setIsMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted/50 transition-colors"
          >
            <Sun className="absolute h-[18px] w-[18px] transition-all duration-300 rotate-0 scale-100 dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[18px] w-[18px] transition-all duration-300 rotate-90 scale-0 dark:rotate-0 dark:scale-100" />
          </button>
        </div>

        {/* Desktop Theme Toggle */}
        <div className="hidden md:block absolute top-4 right-4 z-40">
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="relative w-10 h-10 flex items-center justify-center rounded-full bg-background/50 backdrop-blur-sm border border-border/50 shadow-sm hover:bg-accent transition-colors"
          >
            <Sun className="absolute h-[18px] w-[18px] transition-all duration-300 rotate-0 scale-100 dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[18px] w-[18px] transition-all duration-300 rotate-90 scale-0 dark:rotate-0 dark:scale-100" />
          </button>
        </div>

        {/* Content Area — pr-16 on desktop reserves space for the floating theme toggle */}
        <div className="flex-1 overflow-auto p-6 md:p-8 md:pr-16">
          <div className="mx-auto max-w-7xl space-y-8 animate-fade-in">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

interface NavItem {
  icon: typeof LayoutDashboard;
  label: string;
  href: string;
}

function getNavItems(_features: AppFeatures, _appMode: AppMode): NavItem[] {
  return [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
    { icon: Settings, label: 'Settings', href: '/settings' },
  ];
}
