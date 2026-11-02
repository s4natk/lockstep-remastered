import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  InvestigationValidationError,
  isFailureKind,
  isInvestigationReport,
  normalizeFailure,
} from "@lockstep/shared";
import type { FailureKind, InvestigationReport } from "@lockstep/shared";
import { investigateFailure } from "../src/investigationWorkflow.ts";

interface EvaluationCase {
  id: string;
  input: string;
  expectedCategory: FailureKind;
  expectedFindingCodes: string[];
  relevantSourceIds: string[];
  acceptableExplanationTerms: string[];
  unsupportedConclusions: string[];
  expectedGuidanceTerms: string[];
  normalizationOnly?: boolean;
  expectValidationError?: boolean;
}

interface CaseResult {
  id: string;
  parsing: boolean;
  retrieval?: { matched: number; expected: number };
  citations?: { valid: number; total: number };
  diagnosticExpectations?: boolean;
  actionability?: boolean;
  reliable: boolean;
  normalizationMs: number;
  workflowMs?: number;
  limitations?: string;
  error?: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
}
function isCase(value: unknown): value is EvaluationCase {
  return (
    record(value) &&
    typeof value.id === "string" &&
    typeof value.input === "string" &&
    isFailureKind(value.expectedCategory) &&
    [
      "expectedFindingCodes",
      "relevantSourceIds",
      "acceptableExplanationTerms",
      "unsupportedConclusions",
      "expectedGuidanceTerms",
    ].every((key) => strings(value[key])) &&
    (value.normalizationOnly === undefined || typeof value.normalizationOnly === "boolean") &&
    (value.expectValidationError === undefined || typeof value.expectValidationError === "boolean")
  );
}

const corpus: unknown = JSON.parse(
  (
    await readFile(new URL("../../../eval/investigations/cases.json", import.meta.url), "utf8")
  ).replace(/^\uFEFF/, ""),
);
if (
  !record(corpus) ||
  corpus.schemaVersion !== 1 ||
  !Array.isArray(corpus.cases) ||
  !corpus.cases.every(isCase)
)
  throw new Error("Invalid evaluation corpus.");
const cases = corpus.cases as EvaluationCase[];
if (new Set(cases.map((item) => item.id)).size !== cases.length)
  throw new Error("Duplicate evaluation case IDs.");
const results: CaseResult[] = [];

function reportText(report: InvestigationReport): string {
  return [
    report.summary,
    report.primaryHypothesis?.title,
    report.primaryHypothesis?.explanation,
    ...report.alternatives.flatMap((item) => [item.title, item.explanation]),
    ...report.remediation.flatMap((item) => [item.title, item.detail]),
    ...report.verification.flatMap((item) => [item.title, item.detail]),
    ...report.limitations,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

for (const fixture of cases) {
  const start = performance.now();
  let normalizationMs = 0;
  try {
    const input = { schemaVersion: 1 as const, rawInput: fixture.input };
    const context = normalizeFailure(input);
    normalizationMs = performance.now() - start;
    const parsing =
      !fixture.expectValidationError &&
      context.kind === fixture.expectedCategory &&
      fixture.expectedFindingCodes.every((code) =>
        context.findings.some((finding) => finding.code === code),
      );
    if (fixture.normalizationOnly) {
      results.push({
        id: fixture.id,
        parsing,
        reliable: parsing,
        normalizationMs,
        limitations:
          "SQL classification only. Rust/WASM SQL hazard correctness is covered by Rust fixtures and Wrangler API integration tests.",
      });
      continue;
    }
    const workflowStart = performance.now();
    const report = await investigateFailure(input, {
      env: {},
      sessionId: `eval-${fixture.id}`,
      createdAt: "2026-11-01T15:00:00.000Z",
      parseSql: async () => {
        throw new Error("SQL execution is outside this deterministic evaluation.");
      },
    });
    const workflowMs = performance.now() - workflowStart;
    const sourceIds = new Set(report.evidence.map((item) => item.id));
    const citations = [
      ...report.observations.flatMap((item) => item.evidenceIds),
      ...(report.primaryHypothesis?.evidenceIds ?? []),
      ...report.alternatives.flatMap((item) => item.evidenceIds),
      ...report.remediation.flatMap((item) => item.evidenceIds),
      ...report.verification.flatMap((item) => item.evidenceIds),
    ];
    const prose = reportText(report);
    const diagnosticExpectations =
      fixture.acceptableExplanationTerms.every((term) => prose.includes(term.toLowerCase())) &&
      fixture.unsupportedConclusions.every((term) => !prose.includes(term.toLowerCase()));
    const guidance = [...report.remediation, ...report.verification]
      .flatMap((item) => [item.title, item.detail])
      .join("\n")
      .toLowerCase();
    const actionability =
      report.remediation.length > 0 &&
      report.verification.length > 0 &&
      fixture.expectedGuidanceTerms.every((term) => guidance.includes(term.toLowerCase()));
    results.push({
      id: fixture.id,
      parsing,
      retrieval: {
        matched: fixture.relevantSourceIds.filter((id) => sourceIds.has(id)).length,
        expected: fixture.relevantSourceIds.length,
      },
      citations: {
        valid: citations.filter((id) => sourceIds.has(id)).length,
        total: citations.length,
      },
      diagnosticExpectations,
      actionability,
      reliable:
        isInvestigationReport(report) &&
        report.mode === "deterministic" &&
        report.warnings.some((warning) => warning.code === "provider_not_configured"),
      normalizationMs,
      workflowMs,
    });
  } catch (error) {
    normalizationMs ||= performance.now() - start;
    const rejectedAsExpected =
      fixture.expectValidationError === true && error instanceof InvestigationValidationError;
    results.push({
      id: fixture.id,
      parsing: rejectedAsExpected,
      reliable: rejectedAsExpected,
      normalizationMs,
      ...(rejectedAsExpected
        ? {}
        : { error: error instanceof Error ? error.message : "Unknown evaluation failure" }),
    });
  }
}

function fraction(passed: number, total: number) {
  return { passed, total, ratio: total ? passed / total : null };
}
function percentile(values: number[], quantile: number): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length
    ? (sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)] ?? null)
    : null;
}
const retrievalExpected = results.reduce(
  (sum, result) => sum + (result.retrieval?.expected ?? 0),
  0,
);
const citationTotal = results.reduce((sum, result) => sum + (result.citations?.total ?? 0), 0);
const completed = results.filter((result) => result.workflowMs !== undefined);
const measured = completed.map((result) => result.workflowMs ?? 0);
const metrics = {
  mode: "local deterministic workflow with keyword retrieval; no model or network requests",
  cases: results.length,
  parsing: fraction(results.filter((result) => result.parsing).length, results.length),
  retrievalRecall: fraction(
    results.reduce((sum, result) => sum + (result.retrieval?.matched ?? 0), 0),
    retrievalExpected,
  ),
  citationIdentifiersValid: fraction(
    results.reduce((sum, result) => sum + (result.citations?.valid ?? 0), 0),
    citationTotal,
  ),
  diagnosticExpectations: fraction(
    completed.filter((result) => result.diagnosticExpectations).length,
    completed.length,
  ),
  actionabilityExpectations: fraction(
    completed.filter((result) => result.actionability).length,
    completed.length,
  ),
  reliability: fraction(results.filter((result) => result.reliable).length, results.length),
  localWorkflowLatencyMs: {
    samples: measured.length,
    p50: percentile(measured, 0.5),
    p95: percentile(measured, 0.95),
  },
  limitations: [
    "Citation ID validity does not prove a claim is supported.",
    "Lexical expectations are regression checks and do not measure live AI diagnostic quality.",
    "Latency covers only this local deterministic process; it excludes production, model, embedding, network, persistence, and SQL/WASM latency.",
    "SQL classification is evaluated separately from actual SQL hazard analysis.",
  ],
};
console.log(JSON.stringify({ metrics, results }, null, 2));
if (
  results.some(
    (result) =>
      !result.parsing ||
      !result.reliable ||
      (result.retrieval && result.retrieval.matched !== result.retrieval.expected) ||
      (result.citations && result.citations.valid !== result.citations.total) ||
      result.diagnosticExpectations === false ||
      result.actionability === false,
  )
)
  process.exitCode = 1;
