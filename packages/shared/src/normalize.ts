import type { Evidence, InvestigationInput, NormalizedFailureContext } from "./investigation.js";
import { detectFailureKind } from "./classify.js";
import { parseRuntimeFailure } from "./runtimeFailure.js";
import { parseTestFailure } from "./testFailure.js";
import { parseHttpFailure } from "./httpFailure.js";
import { parseApplicationLog } from "./logFailure.js";
import { parseDatabaseFailure } from "./databaseFailure.js";
import { emptyDetails } from "./parsing.js";
import { validateInvestigationInput } from "./validation.js";

const MAX_EVIDENCE_LINES = 512;
const MAX_FINDINGS = 128;

export function normalizeFailure(value: InvestigationInput): NormalizedFailureContext {
  const input = validateInvestigationInput(value);
  const detectedKind = detectFailureKind(input.rawInput);
  const kind = input.requestedKind ?? detectedKind;
  const lines = input.rawInput.split(/\r\n|\n|\r/);
  const evidence: Evidence[] = [];
  let omittedLines = 0;
  for (const [index, content] of lines.entries()) {
    if (!content.trim()) continue;
    if (evidence.length >= MAX_EVIDENCE_LINES) {
      omittedLines += 1;
      continue;
    }
    const line = index + 1;
    evidence.push({
      id: `input:${line}`,
      kind: "input",
      label: `Submitted input, line ${line}`,
      content,
      provenance: { sourceId: "submission", lineStart: line, lineEnd: line },
    });
  }
  if (
    lines.length > 1 &&
    input.rawInput.trim().startsWith("{") &&
    evidence.length < MAX_EVIDENCE_LINES
  ) {
    try {
      JSON.parse(input.rawInput);
      evidence.push({
        id: "input:document",
        kind: "input",
        label: "Submitted JSON document",
        content: input.rawInput,
        provenance: { sourceId: "submission", lineStart: 1, lineEnd: lines.length },
      });
    } catch {
      /* Parsing warnings describe malformed structured logs below. */
    }
  }
  const parsers = {
    runtime_exception: parseRuntimeFailure,
    test_failure: parseTestFailure,
    http_error: parseHttpFailure,
    application_log: parseApplicationLog,
    database_error: parseDatabaseFailure,
    sql_migration: () => emptyDetails(),
    unknown: () => emptyDetails(),
  };
  const details = parsers[kind](evidence);
  const warnings: NormalizedFailureContext["warnings"] = [];
  if (input.requestedKind && detectedKind !== "unknown" && input.requestedKind !== detectedKind) {
    warnings.push({
      code: "category_override",
      message: `Using the selected ${input.requestedKind} category; automatic detection suggested ${detectedKind}.`,
    });
  }
  if (kind === "unknown") {
    warnings.push({
      code: "unrecognized_input",
      message:
        "No supported failure signature was recognized. Add the exact error and surrounding context or select a category.",
    });
  }
  if (kind === "sql_migration") {
    warnings.push({
      code: "sql_analysis_required",
      message:
        "SQL syntax and migration hazards must be checked by the Rust/WASM analyzer before drawing conclusions.",
    });
  }
  if (details.metadata.malformedJson) {
    warnings.push({
      code: "malformed_json",
      message:
        "At least one log line resembles JSON but is malformed; its original text was retained.",
    });
  }
  if (omittedLines) {
    warnings.push({
      code: "evidence_limit",
      message: `${omittedLines} nonempty line(s) exceeded the ${MAX_EVIDENCE_LINES}-line evidence limit. Submit a shorter relevant excerpt.`,
    });
  }
  if (details.findings.length > MAX_FINDINGS) {
    warnings.push({
      code: "findings_limit",
      message: `Only the first ${MAX_FINDINGS} deterministic findings are included.`,
    });
  }
  if (!details.findings.length && !["unknown", "sql_migration"].includes(kind)) {
    warnings.push({
      code: "limited_details",
      message:
        "The category was recognized, but no supported detailed error fields could be extracted from this excerpt.",
    });
  }
  return {
    schemaVersion: 1,
    input,
    kind,
    ...details,
    findings: details.findings.slice(0, MAX_FINDINGS),
    errorMessages: [...new Set(details.errorMessages)].slice(0, MAX_FINDINGS),
    evidence,
    warnings,
  };
}
