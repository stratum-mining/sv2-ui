import type { LogContainerRole, LogOutputStream, LogSourceKind, LogStreamId, DiagnosticSeverity, ContainerLogLine, DiagnosticEvidence, LogDiagnostic, LogStreamDefinition, LogDiagnosticsResponse, ContainerLogsResponse } from '@sv2-ui/shared';

export type { LogContainerRole, LogOutputStream, LogSourceKind, LogStreamId, DiagnosticSeverity, ContainerLogLine, DiagnosticEvidence, LogDiagnostic, LogStreamDefinition, LogDiagnosticsResponse, ContainerLogsResponse };

export interface LogParser {
  code: string;
  // Each parser is expected to represent one diagnostic scenario
  // (for example, one concrete log-derived user-facing error). It receives
  // the collated log lines for the logical stream and can emit one or many
  // matching diagnostics for that scenario.
  match: (lines: ContainerLogLine[]) => LogDiagnostic | LogDiagnostic[] | null;
}
