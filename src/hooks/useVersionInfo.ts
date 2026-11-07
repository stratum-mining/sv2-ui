import { useQuery } from '@tanstack/react-query';
import type { VersionInfo } from '@sv2-ui/shared';
import { authFetch } from '@/lib/auth-fetch';
import { useAuth } from '@/hooks/useAuth';

async function fetchVersionInfo(): Promise<VersionInfo> {
  const response = await authFetch('/api/version');
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.json() as Promise<VersionInfo>;
}

/** One line naming the sv2-ui build and the sv2-apps release it runs, for support requests. */
export function formatVersionLine(info: VersionInfo): string {
  const commit = info.commit ? ` (${info.commit.slice(0, 7)})` : '';
  return `sv2-ui ${info.version}${commit} · sv2-apps ${info.sv2AppsVersions.join(' / ')}`;
}

/**
 * The running version, or undefined without a session. The Support page also
 * renders for visitors who are not signed in, and `GET /api/version` requires
 * a session, so the request only goes out while signed in and a cached answer
 * is not shown after logging out.
 */
export function useVersionInfo(): VersionInfo | undefined {
  const { authenticated } = useAuth();
  const { data } = useQuery({
    queryKey: ['version-info'],
    queryFn: fetchVersionInfo,
    enabled: authenticated,
  });
  return authenticated ? data : undefined;
}
