import assert from "node:assert/strict";
import { normalizeFailure, isInvestigationReport } from "@lockstep/shared";
import { investigateFailure } from "../src/investigationWorkflow.ts";
import { deterministicDraft } from "../src/investigationGuidance.ts";
import { investigationQueries } from "../src/investigationQueries.ts";
import { retrieveInvestigationEvidence } from "../src/investigationRetrieval.ts";
import { createInvestigationModel } from "../src/investigationModel.ts";
import { validateInvestigationDraft } from "../src/investigationValidation.ts";
import { validateCitationIds } from "../src/investigationCitations.ts";
import { addSqlEvidence } from "../src/investigationEvidence.ts";
import { investigationOwner } from "../src/investigationRepository.ts";
import { investigationReport } from "../src/investigationReport.ts";
import { ProviderFailure, providerFailureWarning } from "../src/providerFailure.ts";

const input = {
  schemaVersion: 1 as const,
  rawInput:
    "TypeError: Cannot read properties of undefined (reading 'name')\n    at render (src/app.ts:12:3)",
};
const context = normalizeFailure(input);
const deps = {
  env: {},
  sessionId: "test-session",
  createdAt: "2026-11-01T16:00:00Z",
  parseSql: async () => ({ statements: [], hazards: [] }),
};
const stages: string[] = [];
const report = await investigateFailure(input, {
  ...deps,
  onProgress: (event) => {
    stages.push(event.stage);
  },
});
assert.equal(isInvestigationReport(report), true);
assert.equal(report.mode, "deterministic");
assert.equal(report.kind, "runtime_exception");
assert.ok(report.warnings.some((warning) => warning.code === "provider_not_configured"));
assert.deepEqual(stages, ["parsing", "retrieving", "investigating", "validating_evidence"]);
assert.equal(report.trace?.length, 4);
assert.ok(report.trace?.every((span) => span.durationMs >= 0 && Number.isFinite(span.durationMs)));
assert.ok(report.primaryHypothesis?.title.includes("missing"));
assert.ok(report.remediation.length && report.verification.length);
assert.ok(investigationQueries(context)[0]?.terms.includes("typeerror"));
const retrieval = await retrieveInvestigationEvidence(context, {});
assert.equal(retrieval.mode, "keyword");
assert.ok(retrieval.evidence.some((item) => item.id === "runbook:runtime-null"));
const connection = await retrieveInvestigationEvidence(
  normalizeFailure({
    schemaVersion: 1,
    rawInput: "request failed: ECONNREFUSED upstream.internal:8080",
  }),
  {},
);
assert.equal(connection.evidence[0]?.id, "runbook:network-timeout");
assert.equal(validateCitationIds(["invented"], context.evidence), false);
const draft = deterministicDraft(context);
assert.equal(validateInvestigationDraft(draft, context), true);
const hallucinated = {
  ...draft,
  primaryHypothesis: { ...draft.primaryHypothesis!, evidenceIds: ["fabricated-source"] },
};
assert.equal(validateInvestigationDraft(hallucinated, context), false);
assert.equal(validateInvestigationDraft({ ...draft, remediation: [] }, context), false);
const noRetrieval = await investigateFailure(input, {
  ...deps,
  retrieve: async () => {
    throw new Error("offline");
  },
});
assert.ok(noRetrieval.warnings.some((warning) => warning.code === "retrieval_unavailable"));
const providerError = await investigateFailure(input, {
  ...deps,
  model: {
    investigate: async () => {
      throw new Error("Secret provider error");
    },
  },
});
assert.equal(providerError.mode, "deterministic");
assert.ok(providerError.warnings.some((warning) => warning.code === "provider_fallback"));
assert.ok(!JSON.stringify(providerError).includes("Secret provider error"));
const malformed = await investigateFailure(input, {
  ...deps,
  model: { investigate: async () => hallucinated },
});
assert.equal(malformed.mode, "deterministic");
const live = await investigateFailure(input, {
  ...deps,
  model: { investigate: async (normalized) => deterministicDraft(normalized) },
});
assert.equal(live.mode, "ai");
const abort = new AbortController();
abort.abort();
await assert.rejects(() => investigateFailure(input, { ...deps, signal: abort.signal }));
const sql = "-- café 日本\nDROP TABLE users;";
const offset = new TextEncoder().encode("-- café 日本\n").byteLength;
const sqlContext = addSqlEvidence(normalizeFailure({ schemaVersion: 1, rawInput: sql }), {
  statements: [
    {
      index: 0,
      sql: "DROP TABLE users;",
      start: offset,
      end: new TextEncoder().encode(sql).byteLength,
    },
  ],
  hazards: [
    {
      statementIndex: 0,
      code: "data_loss",
      reason: "DROP TABLE deletes stored rows.",
      sql: "DROP TABLE users;",
      start: offset,
      end: new TextEncoder().encode(sql).byteLength,
    },
  ],
});
assert.equal(sqlContext.evidence.find((item) => item.id === "sql:1")?.provenance.lineStart, 2);
assert.equal(
  sqlContext.warnings.some((warning) => warning.code === "sql_analysis_required"),
  false,
);
assert.equal(await investigationOwner(null), null);
assert.equal(await investigationOwner("Bearer short"), null);
const owner = await investigationOwner(`Bearer ${"a".repeat(32)}`);
assert.equal(owner?.length, 64);
assert.notEqual(owner, "a".repeat(32));

let requestBody = "";
const fakeFetch: typeof fetch = async (_url, init) => {
  requestBody = String(init?.body);
  return Response.json({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(draft) } }],
  });
};
assert.equal(
  (await createInvestigationModel("test-key", { fetchImpl: fakeFetch }).investigate(context))
    .summary,
  draft.summary,
);
assert.ok(requestBody.includes('"strict":true'));
assert.ok(requestBody.includes('"store":false'));
for (const payload of [
  "{",
  JSON.stringify({ choices: [] }),
  JSON.stringify({
    choices: [{ finish_reason: "length", message: { content: JSON.stringify(draft) } }],
  }),
  JSON.stringify({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(hallucinated) } }],
  }),
]) {
  await assert.rejects(() =>
    createInvestigationModel("test-key", {
      fetchImpl: async () => new Response(payload),
    }).investigate(context),
  );
}
await assert.rejects(() =>
  createInvestigationModel("test-key", {
    fetchImpl: async () => new Response("x", { status: 429 }),
  }).investigate(context),
);
await assert.rejects(() =>
  createInvestigationModel("test-key", {
    fetchImpl: async () => new Response("x".repeat(100_001)),
  }).investigate(context),
);
console.log(
  "Investigation workflow: normalization, retrieval, citations, SQL Unicode, provider failures, cancellation, privacy, and bounded output passed",
);

const maxSql = "DROP TABLE users;".padEnd(32768, " ");
const maxHazard = {
  statementIndex: 0,
  code: "data_loss" as const,
  reason: "DROP TABLE deletes stored rows.",
  sql: maxSql,
  start: 0,
  end: 32768,
};
const maxContext = addSqlEvidence(normalizeFailure({ schemaVersion: 1, rawInput: maxSql }), {
  statements: [{ index: 0, sql: maxSql, start: 0, end: 32768 }],
  hazards: [maxHazard, { ...maxHazard, code: "lock_risk" }],
});
assert.equal(maxContext.evidence.filter((item) => item.kind === "sql_parser").length, 1);
assert.equal(maxContext.evidence.find((item) => item.id === "sql:1")?.content.length, 32768);
assert.equal(
  isInvestigationReport(
    investigationReport(maxContext, deterministicDraft(maxContext), {
      sessionId: "boundary",
      mode: "deterministic",
      createdAt: "2026-11-01T16:00:00Z",
    }),
  ),
  true,
);

const overwrittenIdentity = {
  ...draft,
  sessionId: "another-session",
  kind: "unknown",
  schemaVersion: 1,
};
assert.equal(validateInvestigationDraft(overwrittenIdentity, context), false);
const projected = investigationReport(context, overwrittenIdentity, {
  sessionId: "trusted-session",
  mode: "deterministic",
  createdAt: "2026-11-01T16:00:00Z",
});
assert.equal(projected.sessionId, "trusted-session");
assert.equal(projected.kind, "runtime_exception");
const rejectedIdentity = await investigateFailure(input, {
  ...deps,
  model: { investigate: async () => overwrittenIdentity },
});
assert.equal(rejectedIdentity.sessionId, deps.sessionId);
assert.equal(rejectedIdentity.mode, "deterministic");

// Conversational outputs use the same evidence contract without inventing a failure.
const greetingInput = { schemaVersion: 1 as const, rawInput: "hi" };
const greetingContext = normalizeFailure(greetingInput);
const greetingDraft = {
  assistantAnswer:
    "Hi! What are you working on? Share an error or some project context and I can help.",
  summary: "The user greeted Lockstep; no failure was supplied.",
  primaryHypothesis: null,
  alternatives: [],
  remediation: [],
  verification: [],
  missingInformation: [],
  confidence: "low" as const,
  limitations: [],
};
assert.equal(validateInvestigationDraft(greetingDraft, greetingContext), true);
assert.equal(validateInvestigationDraft(greetingDraft, context), false);
assert.equal(
  validateInvestigationDraft(
    { ...greetingDraft, assistantAnswer: "Hi [invented:1]" },
    greetingContext,
  ),
  false,
);
const greetingReport = await investigateFailure(greetingInput, {
  ...deps,
  model: createInvestigationModel("test-key", {
    fetchImpl: async () =>
      Response.json({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(greetingDraft) } }],
      }),
  }),
});
assert.equal(greetingReport.mode, "ai");
assert.equal(greetingReport.assistantAnswer, greetingDraft.assistantAnswer);
assert.equal(isInvestigationReport(greetingReport), true);
const offlineGreeting = await investigateFailure(greetingInput, deps);
assert.match(offlineGreeting.assistantAnswer!, /^Hi!/);
assert.match(offlineGreeting.assistantAnswer!, /built-in reply/);
assert.ok(!offlineGreeting.assistantAnswer!.includes("underlying cause"));

// Provider error bodies can echo secrets; only fixed public explanations survive.
const privateError = "PRIVATE_PROVIDER_DETAIL_MUST_NOT_LEAK";
for (const [status, errorCode, expected] of [
  [401, "invalid_api_key", "provider_authentication"],
  [403, "permission_denied", "provider_authentication"],
  [402, "billing_not_active", "provider_quota"],
  [404, "model_not_found", "provider_model_unavailable"],
  [400, "invalid_request_error", "provider_request_rejected"],
  [400, "model_not_found", "provider_model_unavailable"],
  [429, "insufficient_quota", "provider_quota"],
  [429, "credit_balance_exhausted", "provider_quota"],
  [429, "organization_spend_limit_exceeded", "provider_quota"],
  [429, "project_spend_limit_exceeded", "provider_quota"],
  [429, "organization_usage_limit_exceeded", "provider_quota"],
  [429, "rate_limit_exceeded", "provider_rate_limited"],
  [500, "internal_error", "provider_unavailable"],
] as const) {
  const failed = await investigateFailure(input, {
    ...deps,
    model: createInvestigationModel("test-key", {
      fetchImpl: async () =>
        Response.json({ error: { code: errorCode, message: privateError } }, { status }),
    }),
  });
  assert.equal(failed.mode, "deterministic");
  assert.ok(failed.warnings.some((warning) => warning.code === expected));
  assert.ok(failed.warnings.some((warning) => warning.code === "provider_fallback"));
  assert.ok(!JSON.stringify(failed).includes(privateError));
}
assert.equal(providerFailureWarning(new ProviderFailure("provider_quota")).code, "provider_quota");
assert.equal(
  providerFailureWarning(new DOMException(privateError, "TimeoutError")).code,
  "provider_timeout",
);
assert.equal(
  providerFailureWarning(new Error("provider_invalid_report")).code,
  "provider_invalid_report",
);
assert.equal(providerFailureWarning(new Error("provider_incomplete")).code, "provider_incomplete");
assert.equal(providerFailureWarning(new Error("provider_refused")).code, "provider_refused");
assert.ok(!providerFailureWarning(new Error(privateError)).message.includes(privateError));
for (const body of ["{", "x".repeat(16_385)]) {
  const failed = await investigateFailure(input, {
    ...deps,
    model: createInvestigationModel("test-key", {
      fetchImpl: async () => new Response(body, { status: 429 }),
    }),
  });
  assert.ok(failed.warnings.some((warning) => warning.code === "provider_rate_limited"));
}
console.log(
  "Greeting replies and safe provider authentication, quota, rate-limit, timeout, validation and privacy diagnostics passed",
);
