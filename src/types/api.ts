/**
 * TypeScript types for the SRI Monitoring API.
 * Auto-generated from shared/openapi.json - DO NOT EDIT MANUALLY
 * Run `npm run generate:types` to regenerate
 */

// Re-export all types from generated file
export type {
  ErrorResponse,
  ExtendedChannelInfo,
  ServerSummary,
  Sv1ClientsSummary,
  Sv2ClientsSummary,
  GlobalInfo,
  HealthResponse,
  MinerTelemetry,
  ServerExtendedChannelInfo,
  ServerStandardChannelInfo,
  ServerChannelsResponse,
  ServerResponse,
  StandardChannelInfo,
  Sv1ClientInfo,
  Sv1ClientsResponse,
  Sv2ClientChannelsResponse,
  Sv2ClientInfo,
  Sv2ClientMetadata,
  Sv2ClientResponse,
  Sv2ClientsResponse,
} from './api-generated';

// ============================================================================
// Application Mode Configuration (manually maintained)
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
