import { readContainerLogs } from '../docker.js';
import type { LogContainerRole } from './types.js';
import type { PoolConfig, SetupData } from '../types.js';

const TRYING_RE = /Trying upstream \d+ of \d+:\s+([^\s:]+):(\d+)/;
const MAX_RETRIES_RE = /Max retries reached for ([^\s:]+):(\d+),\s*moving to next upstream/;

export function findCurrentUpstreamFromLines(lines: string[]): { host: string; port: number } | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (/All upstreams failed/.test(line)) return null;
    const trying = line.match(TRYING_RE);
    if (!trying) continue;
    const host = trying[1];
    const port = Number(trying[2]);
    let movedOn = false;
    for (let j = i + 1; j < lines.length; j++) {
      const m = lines[j].match(MAX_RETRIES_RE);
      if (m && m[1] === host && Number(m[2]) === port) {
        movedOn = true;
        break;
      }
    }
    if (movedOn) continue;
    return { host, port };
  }
  return null;
}

function matchPool(host: string, port: number, data: SetupData): PoolConfig | null {
  const candidates: PoolConfig[] = [];
  if (data.pool) candidates.push(data.pool);
  candidates.push(...data.fallbackPools);
  return candidates.find(
    (p) => p.address.toLowerCase() === host.toLowerCase() && p.port === port,
  ) ?? null;
}

export async function getCurrentUpstreamPoolName(
  container: LogContainerRole,
  data: SetupData | null,
): Promise<string | null> {
  if (!data) return null;
  let lines: string[];
  try {
    const logLines = await readContainerLogs(container, { tail: 100 });
    lines = logLines.map((l) => l.message);
  } catch {
    return null;
  }
  const found = findCurrentUpstreamFromLines(lines);
  if (!found) return null;
  return matchPool(found.host, found.port, data)?.name ?? `${found.host}:${found.port}`;
}
