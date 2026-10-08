import type { QueryClient } from '@tanstack/react-query';

export function clearPersistedDashboardState() {
  if (typeof window === 'undefined') return;

  const prefixes = [
    'sv2_hashrate_history:',
    'sv2_blocks_found:',
    'sv2_best_diff:',
    'sv2_share_stats:',
    'sv2_last_history_key',
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
