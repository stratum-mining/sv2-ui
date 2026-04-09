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
const RECENT_LOG_TAIL = 200;

export type LogProvider = (
  container: LogContainerRole,
  options?: { tail?: number }
) => Promise<ContainerLogLine[]>;

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

async function readCollatedLogLines(
  mode: SetupMode | null,
  readLogs: LogProvider = readContainerLogs
): Promise<ContainerLogLine[]> {
  const containers = getStreamContainers(mode);
  if (containers.length === 0) {
    return [];
  }

  const logSets = await Promise.all(
    containers.map((container) => readLogs(container, { tail: RECENT_LOG_TAIL }))
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
