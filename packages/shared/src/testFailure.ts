import type { Evidence } from "./investigation.js";
import { addFinding, emptyDetails, plainText } from "./parsing.js";
import type { ParsedFailureDetails } from "./parsing.js";

export function parseTestFailure(evidence: Evidence[]): ParsedFailureDetails {
  const result = emptyDetails();
  for (const item of evidence) {
    const text = plainText(item.content).trim();
    if (
      /\bFAILED\b|^FAIL\b|AssertionError|^E\s+assert|assertion.*failed|test result:\s*FAILED/i.test(
        text,
      )
    ) {
      result.errorMessages.push(text);
      addFinding(result, "test.failure", text, [item.id]);
    }
    if (
      /^(?:Expected|Received|Actual|E\s+assert|[+-]\s+(?:Expected|Received))\s*[:=]?/i.test(text)
    ) {
      addFinding(result, "test.assertion", text, [item.id]);
    }
    if (/pytest|::\w+|^E\s+/i.test(text)) result.metadata.runner = "pytest";
    else if (/vitest|❯/i.test(text)) result.metadata.runner = "vitest";
    else if (/jest|Tests:\s*\d+/i.test(text)) result.metadata.runner = "jest";
  }
  return result;
}
