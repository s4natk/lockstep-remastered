import { normalizeFailure, type InvestigationReport } from "@lockstep/shared";
export function fixtureReport(): InvestigationReport {
  const normalized = normalizeFailure({
    schemaVersion: 1,
    rawInput:
      "TypeError: Cannot read properties of undefined (reading 'email')\n    at getProfile (src/profile.ts:28:19)",
  });
  return {
    schemaVersion: 1,
    sessionId: "session-test-1",
    kind: normalized.kind,
    summary: "A property access failed.",
    observations: normalized.findings,
    primaryHypothesis: null,
    alternatives: [],
    remediation: [
      {
        title: "Inspect the value",
        detail: "Reproduce the request and inspect the value before the failing access.",
        evidenceIds: [normalized.evidence[0]!.id],
      },
    ],
    verification: [
      {
        title: "Run a regression test",
        detail: "Test both present and absent profile values.",
        evidenceIds: [],
      },
    ],
    missingInformation: ["The code around the failure."],
    confidence: "low",
    limitations: ["This is an excerpt, not a reproduction."],
    evidence: normalized.evidence,
    warnings: [],
    mode: "deterministic",
    createdAt: "2026-11-01T15:00:00.000Z",
  };
}
