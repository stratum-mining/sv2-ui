import type { PoolConfig } from './types.js';
import type { ContainerLogLine, LogContainerRole } from './logs/types.js';

export type ActivePool = {
  name: string;
  index: number;
  negotiatedAt: string | null;
};

export type ActivePoolLogOptions = {
  since?: number;
};

export type ActivePoolLogProvider = (
  container: LogContainerRole,
  options?: ActivePoolLogOptions
) => Promise<ContainerLogLine[]>;

type DetectionState = {
  activeIndex: number | null;
  activeNegotiatedAt: string | null;
  pendingIndex: number | null;
  connectedIndex: number | null;
};

type TrackerState = DetectionState & {
  configKey: string;
  since: number;
};

const TRYING_UPSTREAM_PATTERN = /\bTrying upstream\s+(\d+)\s+of\s+\d+:\s+(?:pool=)?(\[[^\]]+\]|[^:\s,]+):(\d{1,5})(?:[,\s]|$)/;
const CONNECTED_UPSTREAM_PATTERN = /\bConnected to upstream at\s+(\[[^\]]+\]|[^:\s]+):(\d{1,5})(?:\s|$)/;
const SETUP_CONNECTION_SUCCESS_PATTERN = /\bSetupConnectionSuccess(?:\(|\b)/;

function normalizeHost(host: string): string {
  return host.replace(/^\[|\]$/g, '').toLowerCase();
}

function poolMatchesEndpoint(pool: PoolConfig, host: string, port: number): boolean {
  return normalizeHost(pool.address) === normalizeHost(host) && pool.port === port;
}

function getMatchingPoolIndex(pools: PoolConfig[], host: string, port: number): number | null {
  const index = pools.findIndex((pool) => poolMatchesEndpoint(pool, host, port));

  return index >= 0 ? index : null;
}

function parsePort(value: string): number | null {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

export function detectActivePool(
  pools: PoolConfig[],
  lines: ContainerLogLine[],
  initialState: DetectionState = {
    activeIndex: null,
    activeNegotiatedAt: null,
    pendingIndex: null,
    connectedIndex: null,
  }
): DetectionState {
  let activeIndex = initialState.activeIndex;
  let activeNegotiatedAt = initialState.activeNegotiatedAt;
  let pendingIndex = initialState.pendingIndex;
  let connectedIndex = initialState.connectedIndex;

  for (const line of lines) {
    const tryingMatch = line.message.match(TRYING_UPSTREAM_PATTERN);
    if (tryingMatch) {
      const reportedIndex = Number(tryingMatch[1]) - 1;
      const port = parsePort(tryingMatch[3]);
      const reportedPool = pools[reportedIndex];
      const isConfiguredEndpoint = port !== null &&
        reportedPool !== undefined &&
        poolMatchesEndpoint(reportedPool, tryingMatch[2], port);

      // Require the reported priority and endpoint to agree with the saved
      // configuration before using log content as application state.
      if (!isConfiguredEndpoint) continue;

      pendingIndex = reportedIndex;
      connectedIndex = null;
      // A new attempt means the previous upstream is no longer current.
      activeIndex = null;
      activeNegotiatedAt = null;
      continue;
    }

    const connectedMatch = line.message.match(CONNECTED_UPSTREAM_PATTERN);
    if (connectedMatch) {
      const port = parsePort(connectedMatch[2]);
      const directlyMatchedIndex = port === null
        ? null
        : getMatchingPoolIndex(pools, connectedMatch[1], port);
      connectedIndex = pendingIndex ?? directlyMatchedIndex;
      continue;
    }

    // A TCP connection alone is not enough: certificate validation or SV2
    // negotiation may still fail. Commit the candidate only after the pool
    // accepts SetupConnection.
    if (SETUP_CONNECTION_SUCCESS_PATTERN.test(line.message)) {
      if (connectedIndex !== null && pools[connectedIndex]) {
        activeIndex = connectedIndex;
        activeNegotiatedAt = line.timestamp;
      }
      pendingIndex = null;
      connectedIndex = null;
    }
  }

  return { activeIndex, activeNegotiatedAt, pendingIndex, connectedIndex };
}

function getConfigKey(container: LogContainerRole, pools: PoolConfig[]): string {
  return JSON.stringify([
    container,
    ...pools.map((pool) => [pool.name, normalizeHost(pool.address), pool.port]),
  ]);
}

/**
 * Tracks the most recently connected configured pool without repeatedly
 * reading the container's complete log history on every status poll.
 */
export class ActivePoolTracker {
  private state: TrackerState | null = null;

  constructor(private readonly readLogs: ActivePoolLogProvider) {}

  reset(): void {
    this.state = null;
  }

  async getActivePool(
    container: LogContainerRole,
    pools: PoolConfig[]
  ): Promise<ActivePool | null> {
    if (pools.length === 0) {
      this.reset();
      return null;
    }

    const configKey = getConfigKey(container, pools);
    const previous = this.state?.configKey === configKey ? this.state : null;
    const readStartedAt = Math.floor(Date.now() / 1000);

    try {
      const lines = await this.readLogs(
        container,
        previous ? { since: previous.since } : undefined
      );
      const detected = detectActivePool(pools, lines, previous ?? undefined);
      const activeIndex = detected.activeIndex !== null && pools[detected.activeIndex]
        ? detected.activeIndex
        : null;

      this.state = {
        configKey,
        activeIndex,
        activeNegotiatedAt: detected.activeNegotiatedAt,
        pendingIndex: detected.pendingIndex,
        connectedIndex: detected.connectedIndex,
        // Docker's `since` value is inclusive and has one-second precision.
        // Overlap one second so events at the polling boundary are not lost.
        since: Math.max(0, readStartedAt - 1),
      };

      return activeIndex === null
        ? null
        : {
            name: pools[activeIndex].name,
            index: activeIndex,
            negotiatedAt: detected.activeNegotiatedAt,
          };
    } catch {
      const activeIndex = previous?.activeIndex !== null &&
        previous?.activeIndex !== undefined &&
        pools[previous.activeIndex]
        ? previous.activeIndex
        : null;
      return activeIndex === null
        ? null
        : {
            name: pools[activeIndex].name,
            index: activeIndex,
            negotiatedAt: previous?.activeNegotiatedAt ?? null,
          };
    }
  }
}
