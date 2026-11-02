import type { Evidence, GuidanceStep, RootCauseHypothesis } from "@lockstep/shared";

export function validateCitationIds(
  ids: readonly string[],
  evidence: readonly Evidence[],
): boolean {
  const available = new Set(evidence.map((item) => item.id));
  return ids.length > 0 && ids.length <= 12 && ids.every((id) => available.has(id));
}

export function validateHypothesisCitations(
  hypothesis: RootCauseHypothesis,
  evidence: readonly Evidence[],
): boolean {
  return (
    validateCitationIds(hypothesis.evidenceIds, evidence) &&
    hypothesis.evidenceIds.some((id) => evidence.find((item) => item.id === id)?.kind !== "runbook")
  );
}

export function validateGuidanceCitations(
  steps: readonly GuidanceStep[],
  evidence: readonly Evidence[],
): boolean {
  return steps.every((step) => validateCitationIds(step.evidenceIds, evidence));
}
