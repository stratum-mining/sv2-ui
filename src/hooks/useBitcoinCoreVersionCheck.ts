import { useQuery } from '@tanstack/react-query';
import type {
  BitcoinCoreVersion,
  BitcoinCoreVersionCheckResponse,
  BitcoinNetwork,
  OperatingSystem,
} from '@sv2-ui/shared';

export type BitcoinCoreVersionCheckParams = {
  os: OperatingSystem;
  network: BitcoinNetwork;
  customDataDir: string;
  socketPath: string;
};

export type BitcoinCoreVersionCheckState =
  | { phase: 'checking' }
  | { phase: 'ready'; version: BitcoinCoreVersion }
  | { phase: 'starting' }
  | { phase: 'failed'; title: string; message: string };

const NODE_STARTING_RECHECK_MS = 5_000;

const NO_ANSWER: BitcoinCoreVersionCheckState = {
  phase: 'failed',
  title: 'Could not confirm your Bitcoin Core version',
  message: 'SV2 UI did not answer while checking your node. Try again in a moment.',
};

async function checkVersion({
  os,
  network,
  customDataDir,
  socketPath,
}: BitcoinCoreVersionCheckParams): Promise<BitcoinCoreVersionCheckResponse | null> {
  try {
    const response = await fetch('/api/validate/bitcoin-version', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ os, network, customDataDir, socket_path: socketPath }),
      signal: AbortSignal.timeout(120_000),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/**
 * What the Bitcoin step shows for a check's latest answer. A version being
 * checked again counts as checking, because the node may have changed and
 * Continue must not go ahead on the old answer. The other answers stay on
 * screen, so a recheck doesn't make them flicker.
 */
export function versionCheckState(
  response: BitcoinCoreVersionCheckResponse | null | undefined,
  isFetching: boolean,
): BitcoinCoreVersionCheckState {
  if (response === undefined) return { phase: 'checking' };
  if (response === null) return isFetching ? { phase: 'checking' } : NO_ANSWER;

  switch (response.status) {
    case 'ready':
      return isFetching ? { phase: 'checking' } : { phase: 'ready', version: response.version };
    case 'starting':
      return { phase: 'starting' };
    case 'failed':
      return { phase: 'failed', title: response.title, message: response.message };
  }
}

/**
 * The version Continue may go ahead on. The query stops while the socket check
 * isn't passing, but it keeps its last answer, which says nothing about a socket
 * that has stopped answering since.
 */
export function usableCoreVersion(
  state: BitcoinCoreVersionCheckState,
  socketIsUp: boolean,
): BitcoinCoreVersion | null {
  return socketIsUp && state.phase === 'ready' ? state.version : null;
}

/**
 * Asked again whenever the window regains focus, because changing the node's
 * version usually happens in another window while this page stays open.
 */
export function versionCheckQueryOptions(
  params: BitcoinCoreVersionCheckParams,
  enabled: boolean,
) {
  return {
    queryKey: ['bitcoin-core-version-check', params],
    queryFn: () => checkVersion(params),
    enabled,
    staleTime: 0,
    retry: false,
    refetchOnMount: 'always' as const,
    refetchInterval: (query: { state: { data?: BitcoinCoreVersionCheckResponse | null } }) =>
      query.state.data?.status === 'starting' ? NODE_STARTING_RECHECK_MS : false,
    refetchOnWindowFocus: true,
  };
}

/**
 * Read the version of the node this setup points at, through the check every
 * start runs. It waits for `enabled`, the socket check, because a node that
 * isn't there has no version to read and the socket check explains why.
 */
export function useBitcoinCoreVersionCheck(
  params: BitcoinCoreVersionCheckParams,
  enabled: boolean,
) {
  const { data, isFetching, refetch } = useQuery(versionCheckQueryOptions(params, enabled));

  return {
    state: versionCheckState(data, isFetching),
    isRefreshing: isFetching && data !== undefined,
    retry: () => refetch(),
  };
}
