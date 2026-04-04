import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { 
  GlobalInfo, 
  ServerChannelsResponse, 
  Sv1ClientsResponse,
  ClientsResponse,
  ClientChannelsResponse,
  ClientWithChannels,
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
 * Template mode from configuration.
 * - 'jd': JD Client mode (JDC + Translator)
 * - 'no-jd': Translator-only mode
 */
export type TemplateMode = 'jd' | 'no-jd' | null;

/**
 * Get endpoint configuration.
 * 
 * Both development and production use proxy paths through the backend server
 * to avoid CORS issues with the Translator/JDC monitoring APIs.
 * 
 * - /translator-api/* -> proxied to localhost:9092
 * - /jdc-api/* -> proxied to localhost:9091
 */
function getEndpoints() {
  return {
    jdc: {
      base: '/jdc-api/v1',
      label: 'JD Client',
    },
    translator: {
      base: '/translator-api/v1',
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
 * Convert template mode from config to internal mode.
 * - 'jd' -> 'jdc' (use JDC endpoints)
 * - 'no-jd' or null -> 'translator' (use Translator endpoints)
 */
function templateModeToInternalMode(templateMode: TemplateMode): 'jdc' | 'translator' {
  return templateMode === 'jd' ? 'jdc' : 'translator';
}

/**
 * Collapse detailed Sv2 client data into a single channel aggregate.
 */
function aggregateSv2ClientChannels(clients: ClientWithChannels[]): AggregatedClientChannels {
  return clients.reduce<AggregatedClientChannels>((aggregated, client) => {
    aggregated.total_extended += client.extended_channels.length;
    aggregated.total_standard += client.standard_channels.length;
    aggregated.extended_channels.push(...client.extended_channels);
    aggregated.standard_channels.push(...client.standard_channels);
    return aggregated;
  }, {
    total_extended: 0,
    total_standard: 0,
    extended_channels: [],
    standard_channels: [],
  });
}

/**
 * Fetch all Sv2 clients plus their channels.
 */
async function fetchAllSv2Clients(baseUrl: string): Promise<ClientWithChannels[]> {
  const clientsResponse = await fetchWithTimeout<ClientsResponse>(`${baseUrl}/clients?offset=0&limit=100`);
  
  if (clientsResponse.items.length === 0) {
    return [];
  }
  
  const clientsWithChannels = await Promise.all(clientsResponse.items.map(async (client) => {
    try {
      const channels = await fetchWithTimeout<ClientChannelsResponse>(
        `${baseUrl}/clients/${client.client_id}/channels?offset=0&limit=100`
      );

      return {
        ...client,
        extended_channels: channels.extended_channels,
        standard_channels: channels.standard_channels,
      };
    } catch {
      return {
        ...client,
        extended_channels: [],
        standard_channels: [],
      };
    }
  }));

  return clientsWithChannels;
}

/**
 * Hook to fetch Pool connection data.
 * Uses the configured template mode to determine which endpoints to use.
 * 
 * @param templateMode - The configured template mode from useSetupStatus ('jd' | 'no-jd' | null)
 * 
 * Returns both:
 * - serverChannels: upstream connection to Pool (shares, best diff)
 * - clientChannels: downstream JDC client channels (for Dashboard in JD mode)
 * - sv2Clients: downstream JDC clients with grouped channels (for JD mode worker table)
 */
export function usePoolData(templateMode: TemplateMode = null) {
  const endpoints = getEndpointsCached();
  const mode = templateModeToInternalMode(templateMode);
  
  const baseUrl = mode === 'jdc' ? endpoints.jdc.base : endpoints.translator.base;
  
  // Fetch global stats (includes upstream summary)
  const globalQuery = useQuery({
    queryKey: ['pool-global', mode],
    queryFn: () => fetchWithTimeout<GlobalInfo>(`${baseUrl}/global`),
    refetchInterval: 3000,
  });
  
  // Fetch upstream server channels (Pool connection: shares, best diff)
  const serverChannelsQuery = useQuery({
    queryKey: ['server-channels', mode],
    queryFn: () => fetchWithTimeout<ServerChannelsResponse>(`${baseUrl}/server/channels?offset=0&limit=100`),
    refetchInterval: 3000,
  });

  // Fetch downstream Sv2 clients (for JD mode worker list and best-diff stats)
  const sv2ClientsQuery = useQuery({
    queryKey: ['sv2-clients', mode],
    queryFn: () => fetchAllSv2Clients(baseUrl),
    refetchInterval: 3000,
    enabled: mode === 'jdc',
  });

  const clientChannels = useMemo(
    () => (sv2ClientsQuery.data ? aggregateSv2ClientChannels(sv2ClientsQuery.data) : undefined),
    [sv2ClientsQuery.data]
  );
  
  return {
    mode,
    modeLabel: mode === 'jdc' ? endpoints.jdc.label : endpoints.translator.label,
    isJdMode: mode === 'jdc',
    global: globalQuery.data,
    sv2Clients: sv2ClientsQuery.data,
    isSv2ClientsLoading: sv2ClientsQuery.isLoading,
    // Server channels = upstream Pool connection
    serverChannels: serverChannelsQuery.data,
    // Client channels = downstream JDC channels (for Dashboard)
    clientChannels,
    // Keep 'channels' as alias for serverChannels for backward compatibility
    channels: serverChannelsQuery.data,
    isLoading: globalQuery.isLoading,
    isError: globalQuery.isError,
    error: globalQuery.error,
  };
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
    refetchInterval: 3000,
    enabled,
  });
}

/**
 * Hook to fetch Translator upstream channels.
 * In JD mode this lets the UI identify which downstream worker channels are
 * coming through SV1 translation.
 */
export function useTranslatorServerChannels(enabled = true) {
  const endpoints = getEndpointsCached();

  return useQuery({
    queryKey: ['translator-server-channels'],
    queryFn: () => fetchWithTimeout<ServerChannelsResponse>(`${endpoints.translator.base}/server/channels?offset=0&limit=100`),
    refetchInterval: enabled ? 3000 : false,
    enabled,
  });
}

/**
 * Hook to fetch Translator health (to show connection status).
 */
export function useTranslatorHealth() {
  const endpoints = getEndpointsCached();
  
  return useQuery({
    queryKey: ['translator-health'],
    queryFn: async () => {
      const response = await fetch(`${endpoints.translator.base}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    },
    refetchInterval: 5000,
    retry: false,
  });
}

/**
 * Hook to fetch JDC health (to show connection status).
 * 
 * @param enabled - Whether to enable the health check (default: true).
 *                  Set to false in No-JD mode to skip probing JDC.
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
