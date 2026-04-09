import type { SetupMode } from '../types.js';

export type LogContainerRole = 'translator' | 'jdc';
export type LogOutputStream = 'stdout' | 'stderr';
export type LogSourceKind = 'docker-container-logs' | 'container-log-file';
export type LogStreamId = 'mining-services';
export type DiagnosticSeverity = 'warning' | 'error';

export interface ContainerLogLine {
  container: LogContainerRole;
  stream: LogOutputStream;
  timestamp: string | null;
  message: string;
  raw: string;
}

export interface DiagnosticEvidence {
  container: LogContainerRole;
  stream: LogOutputStream;
  timestamp: string | null;
  line: string;
}

export interface LogDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  title: string;
  message: string;
  recommendation: string;
  streamId: LogStreamId;
  containers: LogContainerRole[];
  detectedAt: string | null;
  evidence: DiagnosticEvidence[];
}

export interface LogStreamDefinition {
  id: LogStreamId;
  label: string;
  containers: LogContainerRole[];
  collated: boolean;
  source: LogSourceKind;
}

export interface LogDiagnosticsResponse {
  configured: boolean;
  mode: SetupMode | null;
  generatedAt: string;
  streams: LogStreamDefinition[];
  diagnostics: LogDiagnostic[];
}

export interface LogParser {
  code: string;
  match: (lines: ContainerLogLine[]) => LogDiagnostic | null;
}
