import type { NormalizedFailureContext } from "@lockstep/shared";
import type { InvestigationDraft } from "./investigationGuidance.js";
import {
  validateGuidanceCitations,
  validateHypothesisCitations,
} from "./investigationCitations.js";

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown, limit = 2000): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= limit;
}
function texts(value: unknown, count = 12): value is string[] {
  return Array.isArray(value) && value.length <= count && value.every((item) => text(item));
}
function confidence(value: unknown) {
  return value === "low" || value === "moderate" || value === "high";
}
function hypothesis(value: unknown): boolean {
  return (
    object(value) &&
    text(value.id, 80) &&
    text(value.title, 200) &&
    text(value.explanation) &&
    texts(value.evidenceIds) &&
    confidence(value.confidence)
  );
}
function guidance(value: unknown): boolean {
  return object(value) && text(value.title, 200) && text(value.detail) && texts(value.evidenceIds);
}

export function validateInvestigationDraft(
  value: unknown,
  context: NormalizedFailureContext,
): value is InvestigationDraft {
  if (
    !object(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          "assistantAnswer",
          "summary",
          "primaryHypothesis",
          "alternatives",
          "remediation",
          "verification",
          "missingInformation",
          "confidence",
          "limitations",
        ].includes(key),
    ) ||
    (value.assistantAnswer !== undefined &&
      (!text(value.assistantAnswer, 20_000) ||
        !validateAnswerCitations(value.assistantAnswer, context))) ||
    !text(value.summary) ||
    !(value.primaryHypothesis === null || hypothesis(value.primaryHypothesis)) ||
    !Array.isArray(value.alternatives) ||
    value.alternatives.length > 4 ||
    !value.alternatives.every(hypothesis) ||
    !Array.isArray(value.remediation) ||
    value.remediation.length === 0 ||
    value.remediation.length > 8 ||
    !value.remediation.every(guidance) ||
    !Array.isArray(value.verification) ||
    value.verification.length === 0 ||
    value.verification.length > 8 ||
    !value.verification.every(guidance) ||
    !texts(value.missingInformation) ||
    !texts(value.limitations) ||
    !confidence(value.confidence)
  )
    return false;
  const draft = value as unknown as InvestigationDraft;
  const hypotheses = [
    ...(draft.primaryHypothesis ? [draft.primaryHypothesis] : []),
    ...draft.alternatives,
  ];
  return (
    hypotheses.every((item) => validateHypothesisCitations(item, context.evidence)) &&
    validateGuidanceCitations([...draft.remediation, ...draft.verification], context.evidence)
  );
}

const strings = { type: "array", items: { type: "string" } };
const certainty = { type: "string", enum: ["low", "moderate", "high"] };
const hypothesisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    explanation: { type: "string" },
    evidenceIds: strings,
    confidence: certainty,
  },
  required: ["id", "title", "explanation", "evidenceIds", "confidence"],
};
const guidanceSchema = {
  type: "object",
  additionalProperties: false,
  properties: { title: { type: "string" }, detail: { type: "string" }, evidenceIds: strings },
  required: ["title", "detail", "evidenceIds"],
};
export const investigationDraftSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    assistantAnswer: { type: "string" },
    summary: { type: "string" },
    primaryHypothesis: { anyOf: [hypothesisSchema, { type: "null" }] },
    alternatives: { type: "array", items: hypothesisSchema },
    remediation: { type: "array", items: guidanceSchema },
    verification: { type: "array", items: guidanceSchema },
    missingInformation: strings,
    confidence: certainty,
    limitations: strings,
  },
  required: [
    "assistantAnswer",
    "summary",
    "primaryHypothesis",
    "alternatives",
    "remediation",
    "verification",
    "missingInformation",
    "confidence",
    "limitations",
  ],
};

export function validateAnswerCitations(
  answer: string,
  context: NormalizedFailureContext,
): boolean {
  const known = new Set(context.evidence.map((item) => item.id));
  const references = [
    ...answer.matchAll(/(?<!\\)\[([A-Za-z][A-Za-z0-9_.-]*:[^\]\s]{1,255})\]/g),
  ].map((match) => match[1]!);
  return references.every((id) => known.has(id));
}
