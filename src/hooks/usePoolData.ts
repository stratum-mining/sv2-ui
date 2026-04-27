import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { 
  GlobalInfo, 
  ServerChannelsResponse, 
  Sv1ClientsResponse,
  ClientsResponse,
  ClientChannelsResponse,
  ClientWithChannels,
  ExtendedChannelInfo,
  StandardChannelInfo,
  AsicScanResponse,
  AsicPoolGroupConfig,
  AsicMinerTelemetry,
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
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json() as { error?: string; message?: string };
      message = body.error || body.message || message;
    } catch {
      // keep the HTTP status fallback
    }
    throw new Error(message);
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
const SV2_CLIENT_PAGE_LIMIT = 100;

async function fetchAllSv2ClientPages(baseUrl: string): Promise<ClientsResponse> {
  const items: ClientsResponse['items'] = [];
  let offset = 0;
  let total = 0;

  do {
    const page = await fetchWithTimeout<ClientsResponse>(
      `${baseUrl}/clients?offset=${offset}&limit=${SV2_CLIENT_PAGE_LIMIT}`
    );

    items.push(...page.items);
    total = page.total;
    offset += page.limit > 0 ? page.limit : SV2_CLIENT_PAGE_LIMIT;

    if (page.items.length === 0) {
      break;
    }
  } while (items.length < total);

  return {
    offset: 0,
    limit: SV2_CLIENT_PAGE_LIMIT,
    total,
    items,
  };
}

async function fetchAllSv2ClientChannelPages(baseUrl: string, clientId: number): Promise<ClientChannelsResponse> {
  const extended_channels: ExtendedChannelInfo[] = [];
  const standard_channels: StandardChannelInfo[] = [];
  let offset = 0;
  let total_extended = 0;
  let total_standard = 0;

  do {
    const page = await fetchWithTimeout<ClientChannelsResponse>(
      `${baseUrl}/clients/${clientId}/channels?offset=${offset}&limit=${SV2_CLIENT_PAGE_LIMIT}`
    );

    extended_channels.push(...page.extended_channels);
    standard_channels.push(...page.standard_channels);
    total_extended = page.total_extended;
    total_standard = page.total_standard;
    offset += page.limit > 0 ? page.limit : SV2_CLIENT_PAGE_LIMIT;

    if (page.extended_channels.length === 0 && page.standard_channels.length === 0) {
      break;
    }
  } while (
    extended_channels.length < total_extended ||
    standard_channels.length < total_standard
  );

  return {
    client_id: clientId,
    offset: 0,
    limit: SV2_CLIENT_PAGE_LIMIT,
    total_extended,
    total_standard,
    extended_channels,
    standard_channels,
  };
}

async function fetchAllSv2Clients(baseUrl: string): Promise<ClientWithChannels[]> {
  const clientsResponse = await fetchAllSv2ClientPages(baseUrl);
  
  if (clientsResponse.items.length === 0) {
    return [];
  }
  
  const clientsWithChannels = await Promise.all(clientsResponse.items.map(async (client) => {
    try {
      const channels = await fetchAllSv2ClientChannelPages(baseUrl, client.client_id);

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
const SV1_CLIENT_PAGE_LIMIT = 1000;

async function fetchSv1ClientsPage(
  baseUrl: string,
  offset: number,
  limit: number,
  includeAsic: boolean
): Promise<Sv1ClientsResponse> {
  const includeAsicParam = includeAsic ? '&include_asic=true' : '';
  const timeoutMs = includeAsic ? 15_000 : 5000;
  return fetchWithTimeout<Sv1ClientsResponse>(
    `${baseUrl}/sv1/clients?offset=${offset}&limit=${limit}${includeAsicParam}`,
    timeoutMs
  );
}

async function fetchAllSv1ClientPages(baseUrl: string, includeAsic = false): Promise<Sv1ClientsResponse> {
  const items: Sv1ClientsResponse['items'] = [];
  let offset = 0;
  let total = 0;

  do {
    const page = await fetchSv1ClientsPage(baseUrl, offset, SV1_CLIENT_PAGE_LIMIT, includeAsic);
    items.push(...page.items);
    total = page.total;
    offset += page.limit > 0 ? page.limit : SV1_CLIENT_PAGE_LIMIT;

    if (page.items.length === 0) {
      break;
    }
  } while (items.length < total);

  return {
    offset: 0,
    limit: SV1_CLIENT_PAGE_LIMIT,
    total,
    items,
  };
}

export function useSv1ClientsData(
  offset = 0,
  limit = 25,
  enabled = true,
  includeAsic = false,
  refetchInterval: number | false = 3000
) {
  const endpoints = getEndpointsCached();
  
  return useQuery({
    queryKey: ['sv1-clients', offset, limit, includeAsic],
    queryFn: () => fetchSv1ClientsPage(endpoints.translator.base, offset, limit, includeAsic),
    refetchInterval,
    staleTime: includeAsic && typeof refetchInterval === 'number' ? refetchInterval : undefined,
    enabled,
  });
}

export function useAllSv1ClientsData(
  enabled = true,
  includeAsic = false,
  refetchInterval: number | false = 3000
) {
  const endpoints = getEndpointsCached();

  return useQuery({
    queryKey: ['sv1-clients-all', includeAsic],
    queryFn: () => fetchAllSv1ClientPages(endpoints.translator.base, includeAsic),
    refetchInterval,
    staleTime: includeAsic && typeof refetchInterval === 'number' ? refetchInterval : undefined,
    enabled,
  });
}

export function useSv1ClientAsicTelemetry(
  clientIds: number[],
  enabled = true,
  refetchInterval: number | false = 30_000
) {
  const endpoints = getEndpointsCached();
  const uniqueClientIds = useMemo(
    () => Array.from(new Set(clientIds)),
    [clientIds]
  );

  return useQueries({
    queries: uniqueClientIds.map((clientId) => ({
      queryKey: ['sv1-client-asic', clientId],
      queryFn: () => fetchWithTimeout<AsicMinerTelemetry>(
        `${endpoints.translator.base}/sv1/clients/${clientId}/asic`,
        12_000
      ),
      enabled: enabled && uniqueClientIds.length > 0,
      refetchInterval,
      staleTime: typeof refetchInterval === 'number' ? refetchInterval : undefined,
      retry: 1,
    })),
  });
}

async function parseControlResponse(response: Response) {
  if (response.ok) return;
  let message = `HTTP ${response.status}`;
  try {
    const body = await response.json() as { error?: string };
    message = body.error || message;
  } catch {
    // keep the HTTP status fallback
  }
  throw new Error(message);
}

const ASIC_SCAN_HOST_TIMEOUT_MS = 3000;
const ASIC_SCAN_CONCURRENCY = 32;
const ASIC_SCAN_TIMEOUT_OVERHEAD_MS = 15_000;
const ASIC_SCAN_MAX_CLIENT_TIMEOUT_MS = 10 * 60_000;

function countScanTargets(targets: string[]) {
  let total = 0;

  for (const rawTarget of targets) {
    const target = rawTarget.trim();
    if (!target) continue;

    if (!target.includes('/')) {
      total += 1;
      continue;
    }

    const [address, prefixValue] = target.split('/');
    if (!address || !prefixValue || !/^\d+$/.test(prefixValue)) {
      return null;
    }

    const octets = address.split('.');
    const prefix = Number(prefixValue);
    if (
      prefix < 0 ||
      prefix > 32 ||
      octets.length !== 4 ||
      !octets.every((octet) => /^\d+$/.test(octet) && Number(octet) >= 0 && Number(octet) <= 255)
    ) {
      return null;
    }

    const hostCount = 2 ** (32 - prefix);
    total += prefix <= 30 ? Math.max(0, hostCount - 2) : hostCount;
  }

  return total;
}

function scanRequestTimeoutMs(targets: string[]) {
  const targetCount = countScanTargets(targets);
  if (targetCount == null) {
    return 30_000;
  }

  const batches = Math.max(1, Math.ceil(targetCount / ASIC_SCAN_CONCURRENCY));
  const estimated = batches * ASIC_SCAN_HOST_TIMEOUT_MS + ASIC_SCAN_TIMEOUT_OVERHEAD_MS;
  return Math.min(Math.max(30_000, estimated), ASIC_SCAN_MAX_CLIENT_TIMEOUT_MS);
}

export async function scanAsicNetwork(targets: string[]): Promise<AsicScanResponse> {
  const endpoints = getEndpointsCached();
  const response = await fetch(`${endpoints.translator.base}/asic/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(scanRequestTimeoutMs(targets)),
    body: JSON.stringify({
      targets,
      timeout_ms: ASIC_SCAN_HOST_TIMEOUT_MS,
      concurrency: ASIC_SCAN_CONCURRENCY,
    }),
  });
  await parseControlResponse(response);
  return response.json() as Promise<AsicScanResponse>;
}

export async function runAsicAction(
  clientId: number,
  action: 'blink' | 'reboot' | 'pause' | 'resume'
): Promise<void> {
  const endpoints = getEndpointsCached();
  const response = await fetch(`${endpoints.translator.base}/sv1/clients/${clientId}/actions/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  await parseControlResponse(response);
}

export async function updateAsicPoolsByIp(
  ip: string,
  poolGroups: AsicPoolGroupConfig[]
): Promise<void> {
  const endpoints = getEndpointsCached();
  const response = await fetch(`${endpoints.translator.base}/asic/${encodeURIComponent(ip)}/pools`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pool_groups: poolGroups }),
  });
  await parseControlResponse(response);
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
