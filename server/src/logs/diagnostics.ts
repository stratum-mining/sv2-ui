import { readContainerLogs } from '../docker.js';
import type { SetupMode } from '../types.js';
import { collectDiagnostics } from './parsers.js';
import type {
  ContainerLogLine,
  LogContainerRole,
  LogDiagnosticsResponse,
  LogStreamDefinition,
} from './types.js';

const LOG_STREAM_ID = 'mining-services' as const;

// Snapshot only the most recent N log lines per container before collation.
// This is a conservative and arbitrary window, not durable log history,
// so older errors can fall out of scope if enough newer lines
// are emitted after they occur.
const RECENT_LOG_TAIL = 200;

export type LogProvider = (
  container: LogContainerRole,
  options?: { tail?: number }
) => Promise<ContainerLogLine[]>;

function isMissingContainerError(error: unknown): boolean {
  let current = error;

  for (let depth = 0; depth < 8 && current && typeof current === 'object'; depth += 1) {
    const candidate = current as {
      cause?: unknown;
      message?: string;
      reason?: string;
      statusCode?: number;
      json?: { message?: string };
    };

    if (
      (candidate.statusCode === 404 && candidate.reason === 'no such container') ||
      candidate.message?.includes('No such container') ||
      candidate.json?.message?.includes('No such container')
    ) {
      return true;
    }

    current = candidate.cause;
  }

  return false;
}

function getStreamContainers(mode: SetupMode | null): LogContainerRole[] {
  if (mode === 'jd') {
    return ['translator', 'jdc'];
  }

  if (mode === 'no-jd') {
    return ['translator'];
  }

  return [];
}

export function getLogStreams(mode: SetupMode | null): LogStreamDefinition[] {
  const containers = getStreamContainers(mode);
  if (containers.length === 0) {
    return [];
  }

  return [
    {
      id: LOG_STREAM_ID,
      label: 'Mining services',
      containers,
      collated: true,
      source: 'docker-container-logs',
    },
  ];
}

function sortLines(a: ContainerLogLine, b: ContainerLogLine): number {
  const aTime = a.timestamp ? Date.parse(a.timestamp) : Number.NaN;
  const bTime = b.timestamp ? Date.parse(b.timestamp) : Number.NaN;

  if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
    return aTime - bTime;
  }

  if (a.container !== b.container) {
    return a.container.localeCompare(b.container);
  }

  return a.raw.localeCompare(b.raw);
}

export async function readCollatedLogLines(
  mode: SetupMode | null,
  readLogs: LogProvider = readContainerLogs
): Promise<ContainerLogLine[]> {
  const containers = getStreamContainers(mode);
  if (containers.length === 0) {
    return [];
  }

  const logSets = await Promise.all(
    containers.map(async (container) => {
      try {
        return await readLogs(container, { tail: RECENT_LOG_TAIL });
      } catch (error) {
        // Diagnostics polling is best-effort. Missing containers are expected
        // while the stack is stopped or between remove/create during restart.
        if (isMissingContainerError(error)) {
          return [];
        }

        throw error;
      }
    })
  );

  return logSets.flat().sort(sortLines);
}

export async function getLogDiagnostics(
  mode: SetupMode | null,
  configured: boolean,
  readLogs: LogProvider = readContainerLogs
): Promise<LogDiagnosticsResponse> {
  const streams = getLogStreams(mode);

  if (!configured || streams.length === 0) {
    return {
      configured,
      mode,
      generatedAt: new Date().toISOString(),
      streams,
      diagnostics: [],
    };
  }

  const lines = await readCollatedLogLines(mode, readLogs);

  return {
    configured,
    mode,
    generatedAt: new Date().toISOString(),
    streams,
    diagnostics: collectDiagnostics(lines),
  };
}
