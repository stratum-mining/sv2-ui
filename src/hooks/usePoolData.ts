import { useQuery } from '@tanstack/react-query';
import type { 
  GlobalInfo, 
  ServerChannelsResponse, 
  Sv1ClientsResponse,
  ClientsResponse,
  ClientChannelsResponse,
  ExtendedChannelInfo,
  StandardChannelInfo,
} from '@/types/api';

/**
 * Aggregated client channels data
 */
export interface AggregatedClientChannels {
  total_extended: number;
  total_standard: number;
  extended_channels: ExtendedChannelInfo[];
  standard_channels: StandardChannelInfo[];
}

/**
 * Detect if we're in development mode (Vite dev server).
 * In dev mode, we use Vite's proxy to avoid CORS issues.
 * In production (embedded UI), we use absolute URLs.
 */
/**
 * Get endpoint configuration.
 * 
 * In DEVELOPMENT (npm run dev):
 *   Uses Vite proxy paths (/jdc-api, /translator-api) to avoid CORS
 * 
 * In PRODUCTION (embedded UI or standalone):
 *   Uses absolute URLs from URL params or env vars:
 *   - ?jdc_url=http://192.168.1.10:9091&translator_url=http://192.168.1.10:9092
 *   - VITE_JDC_URL, VITE_TRANSLATOR_URL
 */
function getEndpoints() {
  // Check for explicit URL overrides (URL params or env vars)
  const urlParams = new URLSearchParams(window.location.search);

  const jdcOverride = urlParams.get('jdc_url') || import.meta.env.VITE_JDC_URL;
  const translatorOverride = urlParams.get('translator_url') || import.meta.env.VITE_TRANSLATOR_URL;

  return {
    jdc: {
      base: jdcOverride ? `${jdcOverride}/api/v1` : '/jdc-api/v1',
      label: 'JD Client',
    },
    translator: {
      base: translatorOverride ? `${translatorOverride}/api/v1` : '/translator-api/v1',
      label: 'Translator',
    },
  };
}

// Cache endpoints (they don't change during runtime)
let cachedEndpoints: ReturnType<typeof getEndpoints> | null = null;

function getEndpointsCached() {
  if (!cachedEndpoints) {
    cachedEndpoints = getEndpoints();
  }
  return cachedEndpoints;
}

/**
 * Detect which mode is active.
 * Checks wizard-data first to know what was deployed, then confirms via health.
 * Only probes endpoints for components that were actually deployed.
 */
async function detectMode(): Promise<'jdc' | 'translator'> {
  const endpoints = getEndpointsCached();

  // Check wizard data to know what was deployed
  let deployedJdc = false;
  let deployedTproxy = true;
  try {
    const res = await fetch('/api/wizard-data', { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const wd = await res.json();
      deployedJdc = wd.constructTemplates === true;
      // tProxy skip is only valid in JD mode — ignore stale skip flags from previous runs
      deployedTproxy = !(wd.constructTemplates === true && wd.skipped_translator_proxy_configuration === true);
    }
  } catch {
    // No wizard data — fall through to health probing
  }

  // If JDC was deployed, check if it's alive
  if (deployedJdc) {
    try {
      const response = await fetch(`${endpoints.jdc.base}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) return 'jdc';
    } catch {
      // JDC not available
    }
  }

  // If tproxy was deployed, check if it's alive
  if (deployedTproxy) {
    try {
      const response = await fetch(`${endpoints.translator.base}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) return 'translator';
    } catch {
      // Translator not available
    }
  }

  // Fallback: try both regardless (e.g. no wizard data yet)
  try {
    const response = await fetch(`${endpoints.jdc.base}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) return 'jdc';
  } catch {}

  return 'translator';
}

/**
 * Fetch data from an endpoint with timeout.
 */
async function fetchWithTimeout<T>(url: string, timeoutMs = 5000): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Hook to detect which mode the stack is running in.
 * Caches the result and re-checks periodically.
 */
export function useStackMode() {
  return useQuery({
    queryKey: ['stack-mode'],
    queryFn: detectMode,
    staleTime: 30000, // Re-check every 30 seconds
    refetchInterval: 30000,
    retry: false,
  });
}

/**
 * Fetch all client channels by first getting client list, then fetching each client's channels.
 * Aggregates all channels into a single response.
 */
async function fetchAllClientChannels(baseUrl: string): Promise<AggregatedClientChannels> {
  // First, get the list of clients
  const clientsResponse = await fetchWithTimeout<ClientsResponse>(`${baseUrl}/clients?offset=0&limit=100`);
  
  if (clientsResponse.items.length === 0) {
    return {
      total_extended: 0,
      total_standard: 0,
      extended_channels: [],
      standard_channels: [],
    };
  }
  
  // Fetch channels for each client in parallel
  const channelPromises = clientsResponse.items.map(client =>
    fetchWithTimeout<ClientChannelsResponse>(`${baseUrl}/clients/${client.client_id}/channels?offset=0&limit=100`)
      .catch(() => null) // Handle individual client failures gracefully
  );
  
  const channelResults = await Promise.all(channelPromises);
  
  // Aggregate all channels
  const aggregated: AggregatedClientChannels = {
    total_extended: 0,
    total_standard: 0,
    extended_channels: [],
    standard_channels: [],
  };
  
  for (const result of channelResults) {
    if (result) {
      aggregated.total_extended += result.total_extended;
      aggregated.total_standard += result.total_standard;
      aggregated.extended_channels.push(...result.extended_channels);
      aggregated.standard_channels.push(...result.standard_channels);
    }
  }
  
  return aggregated;
}

/**
 * Hook to fetch Pool connection data.
 * Automatically fetches from JDC (if available) or Translator.
 * 
 * Returns both:
 * - serverChannels: upstream connection to Pool (shares, best diff)
 * - clientChannels: downstream clients connecting to JDC/Translator (for Dashboard)
 */
export function usePoolData() {
  const endpoints = getEndpointsCached();
  const { data: mode, isLoading: modeLoading } = useStackMode();
  
  const baseUrl = mode === 'jdc' ? endpoints.jdc.base : endpoints.translator.base;
  
  // Fetch global stats (includes upstream summary)
  const globalQuery = useQuery({
    queryKey: ['pool-global', mode],
    queryFn: () => fetchWithTimeout<GlobalInfo>(`${baseUrl}/global`),
    enabled: !modeLoading && !!mode,
    refetchInterval: 3000,
  });
  
  // Fetch upstream server channels (Pool connection: shares, best diff)
  const serverChannelsQuery = useQuery({
    queryKey: ['server-channels', mode],
    queryFn: () => fetchWithTimeout<ServerChannelsResponse>(`${baseUrl}/server/channels?offset=0&limit=100`),
    enabled: !modeLoading && !!mode,
    refetchInterval: 3000,
  });
  
  // Fetch downstream client channels (clients connecting to JDC/Translator - for Dashboard)
  const clientChannelsQuery = useQuery({
    queryKey: ['client-channels', mode],
    queryFn: () => fetchAllClientChannels(baseUrl),
    enabled: !modeLoading && !!mode,
    refetchInterval: 3000,
  });
  
  return {
    mode,
    modeLabel: mode === 'jdc' ? endpoints.jdc.label : endpoints.translator.label,
    isJdMode: mode === 'jdc',
    global: globalQuery.data,
    // Server channels = upstream Pool connection
    serverChannels: serverChannelsQuery.data,
    // Client channels = downstream clients (for Dashboard)
    clientChannels: clientChannelsQuery.data,
    // Keep 'channels' as alias for serverChannels for backward compatibility
    channels: serverChannelsQuery.data,
    isLoading: modeLoading || globalQuery.isLoading,
    isError: globalQuery.isError,
    error: globalQuery.error,
  };
}

/**
 * Hook to fetch SV2 clients from JDC.
 * Used when tProxy is skipped and SV2 miners connect directly to JDC.
 */
export function useSv2ClientsData(enabled = true) {
  const endpoints = getEndpointsCached();

  return useQuery({
    queryKey: ['sv2-clients'],
    queryFn: () => fetchWithTimeout<ClientsResponse>(`${endpoints.jdc.base}/clients?offset=0&limit=100`),
    enabled,
    refetchInterval: enabled ? 3000 : false,
  });
}

/**
 * Hook to fetch SV1 clients data.
 * Always fetches from Translator (the only app with SV1 clients).
 */
export function useSv1ClientsData(offset = 0, limit = 25, enabled = true) {
  const endpoints = getEndpointsCached();

  return useQuery({
    queryKey: ['sv1-clients', offset, limit],
    queryFn: async () => {
      const response = await fetch(
        `${endpoints.translator.base}/sv1/clients?offset=${offset}&limit=${limit}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json() as Promise<Sv1ClientsResponse>;
    },
    enabled,
    refetchInterval: enabled ? 3000 : false,
  });
}

/**
 * Hook to fetch Translator health (to show connection status).
 */
export function useTranslatorHealth(enabled = true) {
  const endpoints = getEndpointsCached();

  return useQuery({
    queryKey: ['translator-health'],
    queryFn: async () => {
      const response = await fetch(`${endpoints.translator.base}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    },
    enabled,
    refetchInterval: enabled ? 5000 : false,
    retry: false,
  });
}

/**
 * Hook to fetch JDC health (to show connection status).
 */
export function useJdcHealth(enabled = true) {
  const endpoints = getEndpointsCached();

  return useQuery({
    queryKey: ['jdc-health'],
    queryFn: async () => {
      const response = await fetch(`${endpoints.jdc.base}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    },
    enabled,
    refetchInterval: enabled ? 5000 : false,
    retry: false,
  });
}

/**
 * Get the current endpoint configuration (for display in Settings).
 */
export function getEndpointConfig() {
  return getEndpointsCached();
}
