import {
  isInvestigationReport,
  type InvestigationReport,
  type NormalizedFailureContext,
} from "@lockstep/shared";
import type { InvestigationDraft } from "./investigationGuidance.js";

export function investigationReport(
  context: NormalizedFailureContext,
  draft: InvestigationDraft,
  options: { sessionId: string; mode: "ai" | "deterministic"; createdAt: string },
): InvestigationReport {
  const report: InvestigationReport = {
    schemaVersion: 1,
    sessionId: options.sessionId,
    kind: context.kind,
    summary: draft.summary,
    primaryHypothesis: draft.primaryHypothesis,
    alternatives: draft.alternatives,
    remediation: draft.remediation,
    verification: draft.verification,
    missingInformation: draft.missingInformation,
    confidence: draft.confidence,
    limitations: draft.limitations,
    observations: context.findings,
    evidence: context.evidence,
    warnings: context.warnings,
    mode: options.mode,
    createdAt: options.createdAt,
  };
  if (!isInvestigationReport(report))
    throw new Error("The investigation report failed validation.");
  return report;
}
