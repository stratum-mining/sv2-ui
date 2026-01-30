/**
 * TypeScript types matching the SRI Monitoring API schemas.
 * These correspond to the Rust types in stratum-apps/src/monitoring/
 */

// ============================================================================
// Server (Upstream) Types
// ============================================================================

/**
 * Information about an extended channel opened with the upstream server.
 * Used by JDC (to Pool) and Translator (to JDC/Pool).
 */
export interface ServerExtendedChannelInfo {
  channel_id: number;
  user_identity: string;
  nominal_hashrate: number;
  target_hex: string;
  extranonce_prefix_hex: string;
  full_extranonce_size: number;
  rollable_extranonce_size: number;
  version_rolling: boolean;
  shares_accepted: number;
  share_work_sum: number;
  last_share_sequence_number: number;
  best_diff: number;
}

/**
 * Information about a standard channel opened with the upstream server.
 */
export interface ServerStandardChannelInfo {
  channel_id: number;
  user_identity: string;
  nominal_hashrate: number;
  target_hex: string;
  extranonce_prefix_hex: string;
  shares_accepted: number;
  share_work_sum: number;
  last_share_sequence_number: number;
  best_diff: number;
}

/**
 * Summary of the server (upstream) connection.
 */
export interface ServerSummary {
  total_channels: number;
  extended_channels: number;
  standard_channels: number;
  total_hashrate: number;
}

/**
 * API response for /api/v1/server
 */
export interface ServerResponse {
  extended_channels_count: number;
  standard_channels_count: number;
  total_hashrate: number;
}

/**
 * API response for /api/v1/server/channels
 */
export interface ServerChannelsResponse {
  offset: number;
  limit: number;
  total_extended: number;
  total_standard: number;
  extended_channels: ServerExtendedChannelInfo[];
  standard_channels: ServerStandardChannelInfo[];
}

// ============================================================================
// Client (Downstream SV2) Types
// ============================================================================

/**
 * Information about an extended channel from a downstream SV2 client.
 * Used by Pool (from JDC/miners) and JDC (from Translator/miners).
 */
export interface ExtendedChannelInfo {
  channel_id: number;
  user_identity: string;
  nominal_hashrate: number;
  target_hex: string;
  requested_max_target_hex: string;
  extranonce_prefix_hex: string;
  full_extranonce_size: number;
  rollable_extranonce_size: number;
  shares_per_minute: number;
  shares_accepted: number;
  share_work_sum: number;
  last_share_sequence_number: number;
  best_diff: number;
  last_batch_accepted: number;
  last_batch_work_sum: number;
  share_batch_size: number;
}

/**
 * Information about a standard channel from a downstream SV2 client.
 */
export interface StandardChannelInfo {
  channel_id: number;
  user_identity: string;
  nominal_hashrate: number;
  target_hex: string;
  requested_max_target_hex: string;
  extranonce_prefix_hex: string;
  shares_per_minute: number;
  shares_accepted: number;
  share_work_sum: number;
  last_share_sequence_number: number;
  best_diff: number;
  last_batch_accepted: number;
  last_batch_work_sum: number;
  share_batch_size: number;
}

/**
 * Metadata about a single SV2 client (without channel arrays).
 */
export interface ClientMetadata {
  client_id: number;
  extended_channels_count: number;
  standard_channels_count: number;
  total_hashrate: number;
}

/**
 * Summary of all downstream SV2 clients.
 */
export interface ClientsSummary {
  total_clients: number;
  total_channels: number;
  extended_channels: number;
  standard_channels: number;
  total_hashrate: number;
}

/**
 * API response for /api/v1/clients
 */
export interface ClientsResponse {
  offset: number;
  limit: number;
  total: number;
  items: ClientMetadata[];
}

/**
 * API response for /api/v1/clients/{id}
 */
export interface ClientResponse {
  client_id: number;
  extended_channels_count: number;
  standard_channels_count: number;
  total_hashrate: number;
}

/**
 * API response for /api/v1/clients/{id}/channels
 */
export interface ClientChannelsResponse {
  client_id: number;
  offset: number;
  limit: number;
  total_extended: number;
  total_standard: number;
  extended_channels: ExtendedChannelInfo[];
  standard_channels: StandardChannelInfo[];
}

// ============================================================================
// SV1 Client Types (Translator only)
// ============================================================================

/**
 * Information about a single SV1 miner connected to Translator.
 */
export interface Sv1ClientInfo {
  client_id: number;
  channel_id: number | null;
  authorized_worker_name: string;
  user_identity: string;
  target_hex: string;
  hashrate: number | null;
  extranonce1_hex: string;
  extranonce2_len: number;
  version_rolling_mask: string | null;
  version_rolling_min_bit: string | null;
}

/**
 * Summary of all SV1 clients.
 */
export interface Sv1ClientsSummary {
  total_clients: number;
  total_hashrate: number;
}

/**
 * API response for /api/v1/sv1/clients
 */
export interface Sv1ClientsResponse {
  offset: number;
  limit: number;
  total: number;
  items: Sv1ClientInfo[];
}

// ============================================================================
// Global Types
// ============================================================================

/**
 * Global statistics from /api/v1/global
 */
export interface GlobalInfo {
  server: ServerSummary;
  clients: ClientsSummary;
  uptime_secs: number;
}

/**
 * Health check response from /api/v1/health
 */
export interface HealthResponse {
  status: string;
  timestamp: number;
}

/**
 * Error response structure
 */
export interface ErrorResponse {
  error: string;
}

// ============================================================================
// Application Mode Configuration
// ============================================================================

/**
 * Defines what features are available based on the application type.
 */
export type AppMode = 'translator' | 'jdc' | 'pool' | 'miner-stack';

/**
 * Feature flags based on application mode.
 */
export interface AppFeatures {
  hasServer: boolean;        // Can show upstream server info
  hasClients: boolean;       // Can show downstream SV2 clients
  hasSv1Clients: boolean;    // Can show SV1 miners (Translator only)
}

/**
 * Returns feature flags for a given application mode.
 */
export function getAppFeatures(mode: AppMode): AppFeatures {
  switch (mode) {
    case 'translator':
      return { hasServer: true, hasClients: false, hasSv1Clients: true };
    case 'jdc':
      return { hasServer: true, hasClients: true, hasSv1Clients: false };
    case 'pool':
      return { hasServer: false, hasClients: true, hasSv1Clients: false };
    case 'miner-stack':
      // Combined view - has everything
      return { hasServer: true, hasClients: true, hasSv1Clients: true };
    default:
      return { hasServer: true, hasClients: true, hasSv1Clients: true };
  }
}
