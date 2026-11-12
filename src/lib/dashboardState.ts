import type { QueryClient } from '@tanstack/react-query';

export function clearPersistedDashboardState() {
  if (typeof window === 'undefined') return;

  const prefixes = [
    'sv2_hashrate_history:',
    'sv2_blocks_found:',
    'sv2_best_diff:',
    'sv2_share_stats:',
  ];

  const keysToRemove: string[] = [];

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => {
    window.localStorage.removeItem(key);
  });
}

export function clearDashboardClientState(queryClient: QueryClient) {
  clearPersistedDashboardState();

  [
    ['pool-global'],
    ['server-channels'],
    ['sv2-clients'],
    ['sv1-clients'],
    ['translator-server-channels'],
    ['translator-health'],
    ['jdc-health'],
  ].forEach((queryKey) => {
    queryClient.removeQueries({ queryKey });
  });
}

const CLEAR_DASHBOARD_ON_SETUP_STORAGE_KEY = 'sv2-ui-setup-clears-dashboard';

/**
 * Settings > Reconfigure replaces the running setup, and the dashboard history
 * belongs to the setup it replaces. The wizard clears that history only
 * once the new setup has started, so leaving the wizard without starting
 * keeps it.
 */
export function requestDashboardClearOnSetup() {
  window.sessionStorage.setItem(CLEAR_DASHBOARD_ON_SETUP_STORAGE_KEY, 'true');
}

/** Reads and removes the request, so it applies to one wizard run only. */
export function takeDashboardClearOnSetup(): boolean {
  const requested = window.sessionStorage.getItem(CLEAR_DASHBOARD_ON_SETUP_STORAGE_KEY) === 'true';
  window.sessionStorage.removeItem(CLEAR_DASHBOARD_ON_SETUP_STORAGE_KEY);
  return requested;
}
