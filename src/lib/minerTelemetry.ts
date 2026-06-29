import type { MinerTelemetry } from '@/types/api';

export type HashrateSource = 'miner_telemetry' | 'estimated' | 'unavailable';

export interface ResolvedHashrate {
  hashrate: number | null;
  source: HashrateSource;
}

function isUsableHashrate(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Prefer miner-reported telemetry, falling back to the proxy's vardiff estimate.
 */
export function resolveMinerHashrate(
  minerTelemetry: MinerTelemetry | null | undefined,
  fallbackHashrate: number | null | undefined
): ResolvedHashrate {
  if (isUsableHashrate(minerTelemetry?.reported_hashrate_hs)) {
    return {
      hashrate: minerTelemetry.reported_hashrate_hs,
      source: 'miner_telemetry',
    };
  }

  if (isUsableHashrate(fallbackHashrate)) {
    return {
      hashrate: fallbackHashrate,
      source: 'estimated',
    };
  }

  return {
    hashrate: null,
    source: 'unavailable',
  };
}
