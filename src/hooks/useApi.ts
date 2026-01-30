import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import type {
  GlobalInfo,
  HealthResponse,
  ServerResponse,
  ServerChannelsResponse,
  ClientsResponse,
  ClientResponse,
  ClientChannelsResponse,
  Sv1ClientsResponse,
  Sv1ClientInfo,
} from '@/types/api';

/**
 * API endpoint configuration for different application modes.
 * In miner-stack mode, we need to fetch from both JDC and Translator.
 */
export const API_ENDPOINTS = {
  translator: '/api/v1',  // Proxied to :9092 in dev, same origin in prod
  jdc: '/api/v1',         // Proxied to :9091 in dev, same origin in prod
};

/**
 * For miner-stack mode, we can configure external endpoints.
 * These are used when running the UI standalone and need to fetch from multiple services.
 */
export const EXTERNAL_ENDPOINTS = {
  jdc: 'http://localhost:9091/api/v1',
  translator: 'http://localhost:9092/api/v1',
};

/**
 * Get the API base URL for a specific service.
 * In single-app mode, uses relative URLs (same origin).
 * In miner-stack mode, can use absolute URLs to reach multiple services.
 */
function getApiBase(service?: 'jdc' | 'translator'): string {
  // Check if we're in miner-stack mode with external endpoints configured
  const urlParams = new URLSearchParams(window.location.search);
  const mode = urlParams.get('mode');
  
  if (mode === 'miner-stack' && service) {
    // In miner-stack mode, use the external endpoint for the specific service
    // This allows fetching from both JDC and Translator
    const jdcUrl = urlParams.get('jdc_url') || EXTERNAL_ENDPOINTS.jdc;
    const translatorUrl = urlParams.get('translator_url') || EXTERNAL_ENDPOINTS.translator;
    
    return service === 'jdc' ? jdcUrl : translatorUrl;
  }
  
  // Default: use relative URL (works when UI is served from the same origin as API)
  return '/api/v1';
}

/**
 * Generic fetch wrapper with error handling.
 */
async function apiFetch<T>(endpoint: string, service?: 'jdc' | 'translator'): Promise<T> {
  const baseUrl = getApiBase(service);
  const response = await fetch(`${baseUrl}${endpoint}`);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }
  
  return response.json();
}

// ============================================================================
// Query Keys - centralized for consistency and cache invalidation
// ============================================================================

export const queryKeys = {
  health: (service?: string) => ['health', service] as const,
  global: (service?: string) => ['global', service] as const,
  server: (service?: string) => ['server', service] as const,
  serverChannels: (offset?: number, limit?: number, service?: string) => ['server', 'channels', { offset, limit, service }] as const,
  clients: (offset?: number, limit?: number, service?: string) => ['clients', { offset, limit, service }] as const,
  client: (id: number, service?: string) => ['clients', id, service] as const,
  clientChannels: (id: number, offset?: number, limit?: number, service?: string) => ['clients', id, 'channels', { offset, limit, service }] as const,
  sv1Clients: (offset?: number, limit?: number) => ['sv1', 'clients', { offset, limit }] as const,
  sv1Client: (id: number) => ['sv1', 'clients', id] as const,
};

// ============================================================================
// Health & Global Hooks
// ============================================================================

/**
 * Hook to fetch health status.
 */
export function useHealth(
  service?: 'jdc' | 'translator',
  options?: Omit<UseQueryOptions<HealthResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.health(service),
    queryFn: () => apiFetch<HealthResponse>('/health', service),
    refetchInterval: 5000, // Check health every 5 seconds
    ...options,
  });
}

/**
 * Hook to fetch global statistics.
 * This is the primary data source for dashboard overview.
 */
export function useGlobalStats(
  service?: 'jdc' | 'translator',
  options?: Omit<UseQueryOptions<GlobalInfo>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.global(service),
    queryFn: () => apiFetch<GlobalInfo>('/global', service),
    refetchInterval: 3000, // Refresh every 3 seconds
    ...options,
  });
}

// ============================================================================
// Server (Upstream) Hooks
// ============================================================================

/**
 * Hook to fetch server (upstream) summary.
 */
export function useServer(
  service?: 'jdc' | 'translator',
  options?: Omit<UseQueryOptions<ServerResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.server(service),
    queryFn: () => apiFetch<ServerResponse>('/server', service),
    refetchInterval: 3000,
    retry: (failureCount, error) => {
      // Don't retry if server monitoring is not available (404)
      if (error instanceof Error && error.message.includes('not available')) {
        return false;
      }
      return failureCount < 3;
    },
    ...options,
  });
}

/**
 * Hook to fetch server channels with pagination.
 */
export function useServerChannels(
  offset: number = 0,
  limit: number = 25,
  options?: Omit<UseQueryOptions<ServerChannelsResponse>, 'queryKey' | 'queryFn'> & { service?: 'jdc' | 'translator' }
) {
  const { service, ...queryOptions } = options || {};
  return useQuery({
    queryKey: queryKeys.serverChannels(offset, limit, service),
    queryFn: () => apiFetch<ServerChannelsResponse>(`/server/channels?offset=${offset}&limit=${limit}`, service),
    refetchInterval: 3000,
    ...queryOptions,
  });
}

// ============================================================================
// Clients (Downstream SV2) Hooks
// ============================================================================

/**
 * Hook to fetch all SV2 clients with pagination.
 */
export function useClients(
  offset: number = 0,
  limit: number = 25,
  options?: Omit<UseQueryOptions<ClientsResponse>, 'queryKey' | 'queryFn'> & { service?: 'jdc' | 'translator' }
) {
  const { service, ...queryOptions } = options || {};
  return useQuery({
    queryKey: queryKeys.clients(offset, limit, service),
    queryFn: () => apiFetch<ClientsResponse>(`/clients?offset=${offset}&limit=${limit}`, service),
    refetchInterval: 3000,
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes('not available')) {
        return false;
      }
      return failureCount < 3;
    },
    ...queryOptions,
  });
}

/**
 * Hook to fetch a single SV2 client by ID.
 */
export function useClient(
  clientId: number,
  service?: 'jdc' | 'translator',
  options?: Omit<UseQueryOptions<ClientResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.client(clientId, service),
    queryFn: () => apiFetch<ClientResponse>(`/clients/${clientId}`, service),
    refetchInterval: 3000,
    ...options,
  });
}

/**
 * Hook to fetch channels for a specific SV2 client.
 */
export function useClientChannels(
  clientId: number,
  offset: number = 0,
  limit: number = 25,
  options?: Omit<UseQueryOptions<ClientChannelsResponse>, 'queryKey' | 'queryFn'> & { service?: 'jdc' | 'translator' }
) {
  const { service, ...queryOptions } = options || {};
  return useQuery({
    queryKey: queryKeys.clientChannels(clientId, offset, limit, service),
    queryFn: () => apiFetch<ClientChannelsResponse>(`/clients/${clientId}/channels?offset=${offset}&limit=${limit}`, service),
    refetchInterval: 3000,
    ...queryOptions,
  });
}

// ============================================================================
// SV1 Clients Hooks (Translator only)
// ============================================================================

/**
 * Hook to fetch all SV1 miners with pagination.
 * Always fetches from Translator (the only app with SV1 support).
 */
export function useSv1Clients(
  offset: number = 0,
  limit: number = 25,
  options?: Omit<UseQueryOptions<Sv1ClientsResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.sv1Clients(offset, limit),
    queryFn: () => apiFetch<Sv1ClientsResponse>(`/sv1/clients?offset=${offset}&limit=${limit}`, 'translator'),
    refetchInterval: 3000,
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes('not available')) {
        return false;
      }
      return failureCount < 3;
    },
    ...options,
  });
}

/**
 * Hook to fetch a single SV1 miner by ID.
 */
export function useSv1Client(
  clientId: number,
  options?: Omit<UseQueryOptions<Sv1ClientInfo>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.sv1Client(clientId),
    queryFn: () => apiFetch<Sv1ClientInfo>(`/sv1/clients/${clientId}`, 'translator'),
    refetchInterval: 3000,
    ...options,
  });
}

// ============================================================================
// Combined Hooks for Miner Stack Mode
// ============================================================================

/**
 * Hook to fetch global stats from both JDC and Translator.
 * Used in miner-stack mode for a combined view.
 */
export function useCombinedGlobalStats() {
  const jdcStats = useGlobalStats('jdc');
  const translatorStats = useGlobalStats('translator');
  
  return {
    jdc: jdcStats,
    translator: translatorStats,
    isLoading: jdcStats.isLoading || translatorStats.isLoading,
    isError: jdcStats.isError && translatorStats.isError, // Only error if both fail
  };
}
