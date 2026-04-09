import type { ContainerLogLine, LogDiagnostic, LogParser } from './types.js';

export const logParsers: LogParser[] = [];

export function collectDiagnostics(
  lines: ContainerLogLine[],
  parsers: LogParser[] = logParsers
): LogDiagnostic[] {
  return parsers
    .map((parser) => parser.match(lines))
    .filter((diagnostic): diagnostic is LogDiagnostic => diagnostic !== null);
}
