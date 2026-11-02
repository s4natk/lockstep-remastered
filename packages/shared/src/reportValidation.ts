import type { Confidence, InvestigationReport } from "./investigation.js";
import { isFailureKind, isRecord } from "./validation.js";

const MAX_COLLECTION = 1_024;
const MAX_TEXT = 32_768;

function text(value: unknown, limit = MAX_TEXT): value is string {
  return typeof value === "string" && value.length <= limit;
}
function texts(value: unknown, limit = MAX_COLLECTION): value is string[] {
  return (
    Array.isArray(value) && value.length <= limit && value.every((entry: unknown) => text(entry))
  );
}
function confidence(value: unknown): value is Confidence {
  return value === "low" || value === "moderate" || value === "high";
}
function collection(
  value: unknown,
  predicate: (entry: unknown) => boolean,
  limit = MAX_COLLECTION,
): boolean {
  return Array.isArray(value) && value.length <= limit && value.every(predicate);
}
function references(value: unknown, knownIds: Set<string>): boolean {
  return texts(value) && value.every((id) => knownIds.has(id));
}
function safeUrl(value: unknown): boolean {
  return (
    value === undefined ||
    (text(value, 2_048) &&
      /^https?:\/\/[^\s]+$/i.test(value) &&
      !/^https?:\/\/[^/?#]*[@\\]/i.test(value))
  );
}
function source(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !text(value.id, 256) ||
    !value.id ||
    typeof value.kind !== "string" ||
    !["input", "runbook", "sql_parser"].includes(value.kind) ||
    !text(value.label, 1_024) ||
    !text(value.content)
  )
    return false;
  const provenance = value.provenance;
  if (
    !isRecord(provenance) ||
    !text(provenance.sourceId, 512) ||
    !provenance.sourceId ||
    !safeUrl(provenance.url)
  )
    return false;
  const { lineStart, lineEnd } = provenance;
  if (
    lineStart !== undefined &&
    (!Number.isInteger(lineStart) || typeof lineStart !== "number" || lineStart < 1)
  )
    return false;
  if (
    lineEnd !== undefined &&
    (!Number.isInteger(lineEnd) || typeof lineEnd !== "number" || lineEnd < 1)
  )
    return false;
  return !(typeof lineStart === "number" && typeof lineEnd === "number" && lineEnd < lineStart);
}

/** Validate the complete wire report before a client renders provider-derived data. */
export function isInvestigationReport(value: unknown): value is InvestigationReport {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !text(value.sessionId, 256) ||
    !value.sessionId ||
    !isFailureKind(value.kind) ||
    !text(value.summary) ||
    !confidence(value.confidence) ||
    typeof value.mode !== "string" ||
    !["ai", "deterministic"].includes(value.mode) ||
    !text(value.createdAt, 64) ||
    !Number.isFinite(Date.parse(value.createdAt))
  )
    return false;
  if (
    value.trace !== undefined &&
    !collection(
      value.trace,
      (entry) =>
        isRecord(entry) &&
        [
          "validating",
          "parsing",
          "retrieving",
          "investigating",
          "validating_evidence",
          "persisting",
          "complete",
          "cancelled",
          "failed",
        ].includes(typeof entry.stage === "string" ? entry.stage : "") &&
        typeof entry.durationMs === "number" &&
        Number.isFinite(entry.durationMs) &&
        entry.durationMs >= 0 &&
        entry.durationMs <= 600_000,
      20,
    )
  )
    return false;
  if (!collection(value.evidence, source)) return false;
  const evidence = value.evidence as Record<string, unknown>[];
  const knownIds = new Set(evidence.map((item) => item.id as string));
  if (knownIds.size !== evidence.length) return false;
  const hypothesis = (entry: unknown): boolean =>
    isRecord(entry) &&
    text(entry.id, 256) &&
    text(entry.title, 1_024) &&
    text(entry.explanation) &&
    references(entry.evidenceIds, knownIds) &&
    confidence(entry.confidence);
  const guidance = (entry: unknown): boolean =>
    isRecord(entry) &&
    text(entry.title, 1_024) &&
    text(entry.detail) &&
    references(entry.evidenceIds, knownIds);
  const finding = (entry: unknown): boolean =>
    isRecord(entry) &&
    text(entry.id, 256) &&
    text(entry.code, 256) &&
    text(entry.message) &&
    references(entry.evidenceIds, knownIds);
  const warning = (entry: unknown): boolean =>
    isRecord(entry) && text(entry.code, 256) && text(entry.message);
  return (
    (value.primaryHypothesis === null || hypothesis(value.primaryHypothesis)) &&
    collection(value.alternatives, hypothesis, 20) &&
    collection(value.observations, finding, 256) &&
    collection(value.remediation, guidance, 40) &&
    collection(value.verification, guidance, 40) &&
    collection(value.warnings, warning, 40) &&
    texts(value.missingInformation, 40) &&
    texts(value.limitations, 40)
  );
}
