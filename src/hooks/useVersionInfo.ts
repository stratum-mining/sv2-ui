import { useQuery } from '@tanstack/react-query';
import type { VersionInfo } from '@sv2-ui/shared';

async function fetchVersionInfo(): Promise<VersionInfo> {
  const response = await fetch('/api/version');
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.json() as Promise<VersionInfo>;
}

/** One line naming the sv2-ui build and the sv2-apps release it selects, for support requests. */
export function formatVersionLine(info: VersionInfo): string {
  const commit = info.commit ? ` (${info.commit.slice(0, 7)})` : '';
  return `sv2-ui ${info.version}${commit} · sv2-apps ${info.sv2AppsVersions.join(' / ')}`;
}

/**
 * The running version. `GET /api/version` is public, so this also works on
 * the Support page for an operator who cannot log in.
 */
export function useVersionInfo(): VersionInfo | undefined {
  const { data } = useQuery({
    queryKey: ['version-info'],
    queryFn: fetchVersionInfo,
  });
  return data;
}
