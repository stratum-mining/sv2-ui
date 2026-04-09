export type LogContainerRole = 'translator' | 'jdc';
export type LogOutputStream = 'stdout' | 'stderr';
export type LogSourceKind = 'docker-container-logs' | 'container-log-file';
export type SetupMode = 'jd' | 'no-jd';

export interface DiagnosticEvidence {
  container: LogContainerRole;
  stream: LogOutputStream;
  timestamp: string | null;
  line: string;
}

export interface LogDiagnostic {
  code: string;
  severity: 'warning' | 'error';
  title: string;
  message: string;
  recommendation: string;
  streamId: 'mining-services';
  containers: LogContainerRole[];
  detectedAt: string | null;
  evidence: DiagnosticEvidence[];
}

export interface LogStreamDefinition {
  id: 'mining-services';
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
