import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard,
  Settings,
  Sun,
  Moon,
  Menu,
  X,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConnectionStatus, getConnectionState } from '@/components/data/ConnectionStatus';
import { useTranslatorHealth, useJdcHealth } from '@/hooks/usePoolData';
import { useUiConfig } from '@/hooks/useUiConfig';
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
}

/**
 * Main application shell with sidebar navigation.
 * Matches Replit UI styling - sidebar-glass effect.
 */
export function Shell({
  children,
  appMode = 'translator',
}: ShellProps) {
  const [location] = useLocation();
  const { isDark, toggle } = useTheme();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { config } = useUiConfig();
  
  // Check health of both services
  const { data: translatorOk, isLoading: translatorLoading } = useTranslatorHealth();
  const { data: jdcOk, isLoading: jdcLoading } = useJdcHealth();
  
  // Consider connected if at least one service is available
  const isLoading = translatorLoading && jdcLoading;
  const isSuccess = Boolean(translatorOk || jdcOk);
  const isError = !isLoading && !isSuccess;
  
  const features = getAppFeatures(appMode);

  const navItems = getNavItems(features, appMode);
  
  // Use custom logo if configured, otherwise default SV2 logo
  const logoUrl = config.customLogoUrl || '/sv2-logo-240x40.png';
  const logoSrcSet = config.customLogoUrl 
    ? undefined 
    : '/sv2-logo-240x40.png 1x, /sv2-logo.png 2x';

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
          <div className="flex h-16 items-center px-6 border-b border-sidebar-border/50">
            <img
              src={logoUrl}
              srcSet={logoSrcSet}
              alt="Stratum V2"
              className="h-7 w-auto max-w-[180px] object-contain"
              decoding="async"
            />
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
                      'group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 mb-1 cursor-pointer',
                      isActive
                        ? 'bg-sidebar-accent text-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
                    )}
                  >
                    <item.icon
                      className={cn(
                        'mr-3 h-4 w-4 transition-colors',
                        isActive
                          ? 'text-foreground'
                          : 'text-muted-foreground group-hover:text-foreground'
                      )}
                    />
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="border-t border-sidebar-border/50 p-4 space-y-3">
            {/* Connection Status */}
            <div className="px-2">
              <ConnectionStatus
                state={getConnectionState(isLoading, isError, isSuccess)}
                label={isSuccess ? 'API Connected' : undefined}
              />
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggle}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-md transition-colors"
            >
              {isDark ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background relative">
        {/* Mobile Menu Trigger */}
        <div className="md:hidden absolute top-4 left-4 z-40">
          <button
            className="p-2 bg-background/50 backdrop-blur-sm border border-border/50 rounded-lg shadow-sm hover:bg-muted/50 transition-colors"
            onClick={() => setIsMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6 md:p-8">
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
    { icon: BarChart3, label: 'Pool Stats', href: '/pool-stats' },
    { icon: Settings, label: 'Settings', href: '/settings' },
  ];
}
