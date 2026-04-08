import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Sun, Moon, Menu, X, LayoutDashboard, Settings, HelpCircle } from 'lucide-react';
import { cn, formatUptime } from '@/lib/utils';
import type { AppMode, AppFeatures } from '@/types/api';
import { getAppFeatures } from '@/types/api';
import { useUiConfig } from '@/hooks/useUiConfig';

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

interface NavItem {
  icon: typeof LayoutDashboard;
  label: string;
  href: string;
}

function getNavItems(_features: AppFeatures, _appMode: AppMode): NavItem[] {
  return [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
    { icon: HelpCircle, label: 'Support', href: '/faq' },
    { icon: Settings, label: 'Settings', href: '/settings' },
  ];
}

interface ShellProps {
  children: React.ReactNode;
  appMode?: AppMode;
  connectionStatus?: 'connected' | 'connecting' | 'disconnected';
  connectionLabel?: string;
  poolName?: string;
  uptime?: number;
}

export function Shell({
  children,
  appMode = 'translator',
  connectionStatus,
  connectionLabel,
  poolName,
  uptime,
}: ShellProps) {
  const [location] = useLocation();
  const { isDark, toggle } = useTheme();
  const { config } = useUiConfig();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const features = getAppFeatures(appMode);
  const navItems = getNavItems(features, appMode);

  // Close on route change
  useEffect(() => { setMenuOpen(false); }, [location]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const Logo = () => (
    <Link href="/" className="shrink-0 flex items-center">
      {config.customLogoDataUrl ? (
        <img
          src={config.customLogoDataUrl}
          alt="Logo"
          className="h-5 w-auto max-w-[120px] object-contain"
        />
      ) : (
        <img
          src="/sv2-logo-240x40.png"
          srcSet="/sv2-logo-240x40.png 1x, /sv2-logo-480x80.png 2x"
          alt="Stratum V2"
          width="120"
          height="20"
          className="h-5 w-auto"
          style={isDark ? undefined : { filter: 'brightness(0.25)' }}
        />
      )}
    </Link>
  );

  const ThemeBtn = ({ size = 7 }: { size?: number }) => (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className={cn(
        'relative flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/8 transition-all duration-150',
        `w-${size} h-${size}`
      )}
    >
      <Sun className="absolute h-[14px] w-[14px] transition-all duration-300 rotate-0 scale-100 dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[14px] w-[14px] transition-all duration-300 rotate-90 scale-0 dark:rotate-0 dark:scale-100" />
    </button>
  );

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground font-sans transition-colors duration-300">

      {/* ── Navbar ── */}
      <header
        ref={menuRef}
        className="sticky top-0 z-40 shrink-0 bg-background/80 backdrop-blur-md border-b border-border/60"
      >
        {/* Bar */}
        <div className="mx-auto max-w-7xl h-14 px-4 sm:px-6 flex items-center gap-5">

          <Logo />

          {/* Desktop: nav */}
          <nav className="hidden sm:flex items-stretch h-14 gap-0 ml-2">
            {navItems.map((item) => {
              const isActive =
                location === item.href ||
                (item.href !== '/' && location.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href}>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3.5 h-full text-[13px] font-medium tracking-[-0.01em] border-b-2 transition-all duration-150 cursor-pointer',
                      isActive
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                    )}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-2 min-w-0">
            {connectionStatus && (
              <>
                {/* Mobile: dot + uptime only (no status text to save space) */}
                <span className="flex sm:hidden items-center gap-2 text-xs text-muted-foreground min-w-0">
                  <span className={cn('h-2 w-2 rounded-full shrink-0', {
                    'bg-green-500': connectionStatus === 'connected',
                    'bg-red-500': connectionStatus === 'disconnected',
                    'bg-yellow-500 animate-pulse': connectionStatus === 'connecting',
                  })} />
                  <span className="truncate">Uptime: {formatUptime(uptime ?? 0)}</span>
                </span>
                {/* Desktop: dot + full status text + uptime */}
                <span className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                  <span className={cn('h-2 w-2 rounded-full shrink-0', {
                    'bg-green-500': connectionStatus === 'connected',
                    'bg-red-500': connectionStatus === 'disconnected',
                    'bg-yellow-500 animate-pulse': connectionStatus === 'connecting',
                  })} />
                  {connectionStatus === 'connected'
                    ? (connectionLabel || `Connected to ${poolName || 'Pool'}`)
                    : connectionStatus === 'connecting'
                    ? 'Connecting...'
                    : 'Disconnected'}
                </span>
                <span className="hidden sm:block text-xs text-muted-foreground border-l border-border pl-2 shrink-0">
                  Uptime: {formatUptime(uptime ?? 0)}
                </span>
              </>
            )}

            {/* Theme toggle — desktop only (mobile: in hamburger) */}
            <span className="hidden sm:block shrink-0"><ThemeBtn /></span>

            {/* Hamburger — mobile only */}
            <button
              className="sm:hidden relative w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/8 transition-all duration-150"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            >
              <Menu
                className={cn(
                  'absolute h-[15px] w-[15px] transition-all duration-200',
                  menuOpen ? 'opacity-0 scale-75 rotate-90' : 'opacity-100 scale-100 rotate-0'
                )}
              />
              <X
                className={cn(
                  'absolute h-[15px] w-[15px] transition-all duration-200',
                  menuOpen ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-75 -rotate-90'
                )}
              />
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        <div
          className={cn(
            'sm:hidden overflow-hidden transition-all duration-200 ease-in-out',
            menuOpen ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'
          )}
        >
          <nav className="px-4 pb-3 pt-1 flex flex-col gap-0.5 border-t border-border/40">
            {navItems.map((item) => {
              const isActive =
                location === item.href ||
                (item.href !== '/' && location.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href}>
                  <span
                    className={cn(
                      'flex items-center w-full px-3 py-2.5 rounded-lg text-[14px] font-medium transition-all duration-150 cursor-pointer',
                      isActive
                        ? 'text-foreground bg-foreground/8'
                        : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
            <button
              onClick={toggle}
              className="flex items-center w-full px-3 py-2.5 rounded-lg text-[14px] font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-all duration-150"
            >
              {isDark ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
              {isDark ? 'Light mode' : 'Dark mode'}
            </button>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <div className="px-4 sm:px-6 py-6 sm:py-8 mx-auto max-w-7xl space-y-6 sm:space-y-8 animate-fade-in">
          {children}
        </div>
      </main>

    </div>
  );
}
