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
  nominal_hashrate: number | null;
  target_hex: string;
  extranonce_prefix_hex: string;
  full_extranonce_size: number;
  rollable_extranonce_size: number;
  version_rolling: boolean;
  shares_acknowledged: number;
  shares_submitted: number;
  shares_rejected: number;
  share_work_sum: number;
  best_diff: number;
  blocks_found: number;
}

/**
 * Information about a standard channel opened with the upstream server.
 */
export interface ServerStandardChannelInfo {
  channel_id: number;
  user_identity: string;
  nominal_hashrate: number | null;
  target_hex: string;
  extranonce_prefix_hex: string;
  shares_acknowledged: number;
  shares_submitted: number;
  shares_rejected: number;
  share_work_sum: number;
  best_diff: number;
  blocks_found: number;
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
  expected_shares_per_minute: number;
  shares_acknowledged: number;
  shares_submitted: number;
  shares_rejected: number;
  share_work_sum: number;
  last_share_sequence_number: number;
  best_diff: number;
  blocks_found: number;
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
  expected_shares_per_minute: number;
  shares_acknowledged: number;
  shares_submitted: number;
  shares_rejected: number;
  share_work_sum: number;
  last_share_sequence_number: number;
  best_diff: number;
  blocks_found: number;
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

/**
 * Sv2 client metadata plus all of its downstream channels.
 */
export interface ClientWithChannels extends ClientMetadata {
  extended_channels: ExtendedChannelInfo[];
  standard_channels: StandardChannelInfo[];
}

// ============================================================================
// SV1 Client Types (Translator only)
// ============================================================================

export interface AsicMinerCapabilities {
  telemetry: boolean;
  restart: boolean;
  pause: boolean;
  resume: boolean;
  blink_led: boolean;
  pools_config: boolean;
  power_limit: boolean;
  tuning_config: boolean;
}

export interface AsicHashboardTelemetry {
  position: number;
  hashrate_hs: number | null;
  expected_hashrate_hs: number | null;
  board_temperature_c: number | null;
  intake_temperature_c: number | null;
  outlet_temperature_c: number | null;
  expected_chips: number | null;
  working_chips: number | null;
  serial_number: string | null;
  voltage_v: number | null;
  frequency_mhz: number | null;
  tuned: boolean | null;
  active: boolean | null;
}

export interface AsicFanTelemetry {
  position: number;
  rpm: number | null;
}

export interface AsicMinerMessage {
  timestamp: number;
  code: number;
  message: string;
  severity: string;
}

export interface AsicPoolData {
  position: number | null;
  url: string | null;
  accepted_shares: number | null;
  rejected_shares: number | null;
  active: boolean | null;
  alive: boolean | null;
  user: string | null;
}

export interface AsicPoolGroupData {
  name: string;
  quota: number;
  pools: AsicPoolData[];
}

export interface AsicPoolConfig {
  url: string;
  username: string;
  password: string;
}

export interface AsicPoolGroupConfig {
  name: string;
  quota: number;
  pools: AsicPoolConfig[];
}

export interface AsicMinerTelemetry {
  ip: string;
  make: string;
  model: string;
  firmware: string;
  firmware_version: string | null;
  serial_number: string | null;
  mac_address: string | null;
  hostname: string | null;
  api_version: string | null;
  control_board_version: string | null;
  hashrate_hs: number | null;
  expected_hashrate_hs: number | null;
  power_w: number | null;
  efficiency_j_th: number | null;
  average_temperature_c: number | null;
  fluid_temperature_c: number | null;
  uptime_secs: number | null;
  is_mining: boolean;
  light_flashing: boolean | null;
  expected_hashboards: number | null;
  expected_chips: number | null;
  total_chips: number | null;
  expected_fans: number | null;
  hashboards: AsicHashboardTelemetry[];
  fans: AsicFanTelemetry[];
  psu_fans: AsicFanTelemetry[];
  pools: AsicPoolGroupData[];
  messages: AsicMinerMessage[];
  capabilities: AsicMinerCapabilities;
  last_updated_at: number;
}

export interface AsicDiscoveredMiner {
  ip: string;
  port: number | null;
  make: string;
  model: string;
  firmware: string;
  firmware_version: string | null;
  serial_number: string | null;
  mac_address: string | null;
  hostname: string | null;
  capabilities: AsicMinerCapabilities;
}

export interface AsicScanError {
  target: string;
  error: string;
}

export interface AsicScanResponse {
  total_targets: number;
  found: AsicDiscoveredMiner[];
  errors: AsicScanError[];
}

/**
 * Information about a single SV1 miner connected to Translator.
 */
export interface Sv1ClientInfo {
  client_id: number;
  channel_id: number | null;
  peer_ip?: string | null;
  peer_port?: number | null;
  asic?: AsicMinerTelemetry | null;
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
 * 
 * Note: Fields are optional (null) when that monitoring component is not enabled.
 * - JDC: `server` and `sv2_clients` present, `sv1_clients` null
 * - Translator: `server` and `sv1_clients` present, `sv2_clients` may be null
 */
export interface GlobalInfo {
  server: ServerSummary | null;
  sv2_clients: ClientsSummary | null;
  sv1_clients: Sv1ClientsSummary | null;
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
