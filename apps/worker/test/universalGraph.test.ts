import assert from "node:assert/strict";
import { normalizeFailure, type InvestigationInput } from "@lockstep/shared";
import { compileInvestigationGraph, investigateFailure } from "../src/investigationWorkflow.ts";
import { deterministicDraft } from "../src/investigationGuidance.ts";
import { boundedConversation, createInvestigationModel } from "../src/investigationModel.ts";
import { AssistantAnswerDecoder } from "../src/investigationStream.ts";
import { validateInvestigationDraft } from "../src/investigationValidation.ts";
import { providerBaseUrl, providerConfig } from "../src/providerConfig.ts";
import { createEnvEmbedder } from "../src/embeddings.ts";
import { createReviewModel } from "../src/reviewGraph.ts";
import { streamAssistantReply } from "../src/assistantChat.ts";

const input: InvestigationInput = {
  schemaVersion: 1,
  rawInput:
    "TypeError: Cannot read properties of undefined (reading 'name')\n    at render (src/app.ts:12:3)",
};
const context = normalizeFailure(input);
let sqlCalls = 0;
const deps = {
  env: {},
  sessionId: "graph-test",
  createdAt: "2026-11-02T16:00:00Z",
  parseSql: async () => {
    sqlCalls += 1;
    return { statements: [], hazards: [] };
  },
};
const graph = compileInvestigationGraph(deps).getGraph();
for (const node of [
  "normalize_failure",
  "analyze_sql",
  "retrieve_evidence",
  "investigate_cause",
  "validate_report",
])
  assert.ok(node in graph.nodes);
const chunks: string[] = [];
const first = await investigateFailure(input, {
  ...deps,
  onText: (text) => {
    chunks.push(text);
  },
});
assert.equal(sqlCalls, 0);
assert.equal(first.mode, "deterministic");
assert.equal(chunks.length, 1);
assert.equal(chunks[0], first.assistantAnswer);
const followup = await investigateFailure(input, {
  ...deps,
  question: "Show a code guard and tell me which file to inspect",
  conversation: [{ role: "assistant", content: first.assistantAnswer! }],
});
assert.match(followup.assistantAnswer!, /follow-up/);
assert.match(followup.assistantAnswer!, /```typescript/);
assert.match(followup.assistantAnswer!, /src\/app\.ts:12/);
assert.notEqual(followup.assistantAnswer, first.assistantAnswer);
await investigateFailure({ schemaVersion: 1, rawInput: "DROP TABLE users;" }, deps);
assert.equal(sqlCalls, 1);
const sqlFailed = await investigateFailure(
  { schemaVersion: 1, rawInput: "ALTER TABLE" },
  {
    ...deps,
    parseSql: async () => {
      throw new Error("private SQL error");
    },
  },
);
assert.ok(sqlFailed.warnings.some((warning) => warning.code === "sql_parse_failed"));
let observedQuery = "";
let observedQuestion = "";
let observedConversation = "";
const contextual = await investigateFailure(input, {
  ...deps,
  question: "Does the user cache explain this?",
  conversation: [{ role: "user", content: "The cache returns no user" }],
  contextEvidence: [
    {
      id: "context:cache:1",
      kind: "context",
      label: "Cache contract",
      content: "A cache miss returns undefined.",
      provenance: { sourceId: "knowledge:cache", lineStart: 1, lineEnd: 1 },
    },
  ],
  retrieve: async (_context, _signal, query) => {
    observedQuery = query ?? "";
    return { evidence: [], mode: "keyword", warnings: [] };
  },
  model: {
    investigate: async (value, _signal, turn) => {
      observedQuestion = turn?.question ?? "";
      observedConversation = turn?.conversation?.[0]?.content ?? "";
      assert.ok(value.evidence.some((item) => item.id === "context:cache:1"));
      return deterministicDraft(value);
    },
  },
});
assert.match(observedQuery, /user cache/);
assert.equal(observedQuestion, "Does the user cache explain this?");
assert.equal(observedConversation, "The cache returns no user");
assert.equal(contextual.mode, "ai");
const bounded = boundedConversation(
  Array.from({ length: 20 }, (_, index) => ({
    role: "user" as const,
    content: `${index}:` + "x".repeat(7000),
  })),
);
assert.ok(
  bounded.length <= 10 &&
    bounded.reduce((sum, message) => sum + message.content.length, 0) <= 24_000,
);
assert.ok(bounded.at(-1)?.content.startsWith("19:"));

const { assistantAnswer: _localAnswer, ...draftFields } = deterministicDraft(context);
const answer =
  'A missing value caused the access to fail; the producer is still unknown. [input:1]\n\n```typescript\nif (value == null) throw new Error("missing");\n```\nUnicode: café 😀';
const draft = { assistantAnswer: answer, ...draftFields };
function streamingResponse(document: string, finish = "stop"): Response {
  const events: string[] = [];
  for (let offset = 0; offset < document.length; offset += 3)
    events.push(
      `data: ${JSON.stringify({ choices: [{ delta: { content: document.slice(offset, offset + 3) }, finish_reason: null }] })}\r\n\r\n`,
    );
  events.push(
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finish }] })}\n\ndata: [DONE]\n\n`,
  );
  const encoded = new TextEncoder().encode(events.join(""));
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < encoded.length; offset += 7)
          controller.enqueue(encoded.slice(offset, offset + 7));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}
let providerUrl = "";
let providerRequest = "";
const streamed: string[] = [];
const model = createInvestigationModel("test-key", {
  model: "custom/chat",
  baseUrl: "https://proxy.example.test/v1/",
  fetchImpl: async (url, init) => {
    providerUrl = String(url);
    providerRequest = String(init?.body);
    return streamingResponse(JSON.stringify(draft).replaceAll("😀", "\\uD83D\\uDE00"));
  },
});
const actual = await model.investigate(context, undefined, {
  question: "How can I fix it?",
  conversation: [{ role: "assistant", content: "Earlier explanation" }],
  onText: (delta) => {
    streamed.push(delta);
  },
});
assert.equal(actual.assistantAnswer, answer);
assert.equal(streamed.join(""), answer);
assert.ok(streamed.length > 1);
assert.ok(streamed.every((part) => !/[\uD800-\uDBFF]$/.test(part)));
assert.equal(providerUrl, "https://proxy.example.test/v1/chat/completions");
const request = JSON.parse(providerRequest) as {
  stream: boolean;
  model: string;
  messages: Array<{ role: string; content: string }>;
};
assert.equal(request.stream, true);
assert.equal(request.model, "custom/chat");
assert.match(request.messages[1]!.content, /Earlier explanation/);
assert.match(request.messages[1]!.content, /How can I fix it/);
assert.ok(!providerRequest.includes("test-key"));
assert.equal(
  validateInvestigationDraft(
    { ...draft, assistantAnswer: "A fabricated source [missing:1]" },
    context,
  ),
  false,
);
const discarded = await investigateFailure(input, {
  ...deps,
  model: createInvestigationModel("test-key", {
    fetchImpl: async () =>
      streamingResponse(JSON.stringify({ ...draft, assistantAnswer: "Unverified [missing:1]" })),
  }),
});
assert.equal(discarded.mode, "deterministic");
assert.ok(discarded.warnings.some((warning) => warning.code === "provider_fallback"));
assert.ok(!discarded.assistantAnswer?.includes("missing:1"));
for (const response of [
  () => streamingResponse(JSON.stringify(draft), "length"),
  () => new Response("data: {\n\n", { headers: { "content-type": "text/event-stream" } }),
  () =>
    new Response(
      `data: ${JSON.stringify({ choices: [{ delta: { refusal: "refused" }, finish_reason: "stop" }] })}\n\n`,
      { headers: { "content-type": "text/event-stream" } },
    ),
])
  await assert.rejects(() =>
    createInvestigationModel("test-key", { fetchImpl: async () => response() }).investigate(
      context,
    ),
  );
const decoder = new AssistantAnswerDecoder();
assert.equal(decoder.push('{"assistantAnswer":"a\\uD83D'), "a");
assert.equal(decoder.push('\\uDE80\\n\\"b\\""}'), '🚀\n"b"');
const aborted = new AbortController();
aborted.abort();
await assert.rejects(() => model.investigate(context, aborted.signal));
assert.equal(providerBaseUrl("http://127.0.0.1:1234/v1/"), "http://127.0.0.1:1234/v1");
for (const url of [
  "http://example.com/v1",
  "https://" + ["user", "password"].join(":") + "@example.com/v1",
  "https://example.com/v1?key=value",
  "https://example.com/#fragment",
  "file:///tmp/provider",
])
  assert.throws(() => providerBaseUrl(url));
const config = providerConfig({
  OPENAI_API_KEY: " test-key ",
  OPENAI_MODEL: "custom/chat",
  OPENAI_BASE_URL: "http://localhost:1234/v1",
  OPENAI_EMBEDDING_MODEL: "custom/embed",
});
assert.equal(config.apiKey, "test-key");
let embeddingRequest: { url: string; model: string } | undefined;
await createEnvEmbedder(
  {
    OPENAI_API_KEY: "test-key",
    OPENAI_BASE_URL: config.baseUrl,
    OPENAI_EMBEDDING_MODEL: config.embeddingModel,
  },
  async (url, init) => {
    embeddingRequest = { url: String(url), model: JSON.parse(String(init?.body)).model };
    return Response.json({ data: [{ embedding: Array.from({ length: 64 }, () => 0.1) }] });
  },
).embed("cache miss");
assert.deepEqual(embeddingRequest, {
  url: "http://localhost:1234/v1/embeddings",
  model: "custom/embed",
});
let legacyBody = "";
let legacyUrl = "";
const legacyFetch: typeof fetch = async (url, init) => {
  legacyUrl = String(url);
  legacyBody = String(init?.body);
  return new Response('data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n');
};
for await (const _token of createReviewModel("test-key", legacyFetch, config).stream({
  prompt: "SQL review",
  hazards: [],
  chunks: [],
})) {
  /* consume the real adapter */
}
assert.equal(JSON.parse(legacyBody).model, "custom/chat");
assert.equal(legacyUrl, "http://localhost:1234/v1/chat/completions");
for await (const _token of streamAssistantReply("explain SQL", "test-key", legacyFetch, config)) {
  /* consume the real adapter */
}
assert.equal(JSON.parse(legacyBody).model, "custom/chat");
console.log(
  "Universal graph: real nodes, SQL branches, memory, contextual fallback, streamed escaped Unicode, citation rejection, provider errors, abort, privacy and consistent custom configuration passed",
);

const maximumRuntime = await investigateFailure(
  { schemaVersion: 1, rawInput: "TypeError: ".padEnd(32768, "x") },
  deps,
);
assert.equal(maximumRuntime.mode, "deterministic");
assert.ok(maximumRuntime.assistantAnswer && maximumRuntime.assistantAnswer.length < 20000);
let whitespaceCalled = false;
for await (const _token of createReviewModel(" ", async () => {
  whitespaceCalled = true;
  throw new Error("must not call");
}).stream({ prompt: "", hazards: [], chunks: [] })) {
  /* consume deterministic fallback */
}
assert.equal(whitespaceCalled, false);
