import type { DeterministicFinding, NormalizedFailureContext } from "./investigation.js";

export type ParsedFailureDetails = Pick<
  NormalizedFailureContext,
  "errorMessages" | "findings" | "stackFrames" | "metadata"
>;

export function emptyDetails(): ParsedFailureDetails {
  return { errorMessages: [], findings: [], stackFrames: [], metadata: {} };
}

export function addFinding(
  details: ParsedFailureDetails,
  code: string,
  message: string,
  evidenceIds: string[],
): void {
  const finding: DeterministicFinding = {
    id: `finding:${details.findings.length + 1}`,
    code,
    message,
    evidenceIds,
  };
  details.findings.push(finding);
}

const ansiSequence = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");

export function plainText(text: string): string {
  return text.replace(ansiSequence, "");
}
