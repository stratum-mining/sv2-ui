import { readContainerLogs } from '../docker.js';
import { isMissingContainerError } from '../docker-errors.js';
import type { SetupMode } from '@sv2-ui/shared';
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

// Concurrent callers reading the same mode share one in-flight Docker log
// snapshot per provider instead of each starting their own. The diagnostics
// route is polled every few seconds, so overlapping callers (UI tabs or
// request bursts) would otherwise multiply Docker-socket reads, parsing, and
// heap use without bound. Entries are evicted as soon as their snapshot
// settles, so the next caller always starts a fresh read.
const inFlightSnapshots = new WeakMap<
  LogProvider,
  Map<SetupMode | null, Promise<ContainerLogLine[]>>
>();

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

  let snapshots = inFlightSnapshots.get(readLogs);
  if (!snapshots) {
    snapshots = new Map();
    inFlightSnapshots.set(readLogs, snapshots);
  }

  const inFlight = snapshots.get(mode);
  if (inFlight) {
    return inFlight;
  }

  const snapshot = Promise.all(
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
  ).then((logSets) => logSets.flat().sort(sortLines));

  snapshots.set(mode, snapshot);

  try {
    return await snapshot;
  } finally {
    if (snapshots.get(mode) === snapshot) {
      snapshots.delete(mode);
    }
  }
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
