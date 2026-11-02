export const FAILURE_KINDS = [
  "runtime_exception",
  "test_failure",
  "http_error",
  "application_log",
  "database_error",
  "sql_migration",
  "unknown",
] as const;

export type FailureKind = (typeof FAILURE_KINDS)[number];
export type Confidence = "low" | "moderate" | "high";

export interface InvestigationInput {
  schemaVersion: 1;
  rawInput: string;
  description?: string;
  environment?: Record<string, string>;
  requestedKind?: FailureKind;
}

export interface EvidenceProvenance {
  sourceId: string;
  lineStart?: number;
  lineEnd?: number;
  url?: string;
}

export interface Evidence {
  id: string;
  kind: "input" | "runbook" | "sql_parser" | "context";
  label: string;
  content: string;
  provenance: EvidenceProvenance;
}

export interface DeterministicFinding {
  id: string;
  code: string;
  message: string;
  evidenceIds: string[];
}

export interface ParsingWarning {
  code: string;
  message: string;
}

export interface StackFrame {
  language: "python" | "javascript" | "java" | "rust";
  file: string;
  line?: number;
  column?: number;
  function?: string;
  evidenceId: string;
}

export interface LogEvent {
  id: string;
  severity: "trace" | "debug" | "info" | "warning" | "error" | "fatal" | "critical" | "unknown";
  message: string;
  timestamp?: string;
  service?: string;
  requestId?: string;
  traceId?: string;
  evidenceIds: string[];
  stackFrames: StackFrame[];
}

export interface NormalizedFailureContext {
  logEvents?: LogEvent[];
  schemaVersion: 1;
  input: InvestigationInput;
  kind: FailureKind;
  errorMessages: string[];
  stackFrames: StackFrame[];
  metadata: Record<string, string>;
  findings: DeterministicFinding[];
  evidence: Evidence[];
  warnings: ParsingWarning[];
}

export interface RetrievalQuery {
  text: string;
  kind: FailureKind;
  terms: string[];
}

export interface RootCauseHypothesis {
  id: string;
  title: string;
  explanation: string;
  evidenceIds: string[];
  confidence: Confidence;
}

export interface GuidanceStep {
  title: string;
  detail: string;
  evidenceIds: string[];
}

export interface InvestigationReport {
  logEvents?: LogEvent[];
  assistantAnswer?: string;
  schemaVersion: 1;
  sessionId: string;
  kind: FailureKind;
  summary: string;
  observations: DeterministicFinding[];
  primaryHypothesis: RootCauseHypothesis | null;
  alternatives: RootCauseHypothesis[];
  remediation: GuidanceStep[];
  verification: GuidanceStep[];
  missingInformation: string[];
  confidence: Confidence;
  limitations: string[];
  evidence: Evidence[];
  warnings: ParsingWarning[];
  mode: "ai" | "deterministic";
  createdAt: string;
  trace?: Array<{ stage: WorkflowStage; durationMs: number }>;
}

export type WorkflowStage =
  | "validating"
  | "parsing"
  | "retrieving"
  | "investigating"
  | "validating_evidence"
  | "persisting"
  | "complete"
  | "cancelled"
  | "failed";
export type InvestigationStatus = "running" | "complete" | "cancelled" | "failed";

export interface InvestigationProgress {
  schemaVersion: 1;
  sessionId: string;
  stage: WorkflowStage;
  message: string;
  timestamp: string;
}

export interface InvestigationSession {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  status: InvestigationStatus;
  kind: FailureKind;
  summary: string;
  report?: InvestigationReport;
  error?: string;
}
