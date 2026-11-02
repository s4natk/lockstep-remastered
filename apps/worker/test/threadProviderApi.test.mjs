import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { unstable_dev } from "wrangler";

const calls = [];
const delayed = new Set();
const provider = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const payload = JSON.parse(body);
  calls.push(payload);
  assert.equal(req.url, "/v1/chat/completions");
  assert.equal(req.headers.authorization, "Bearer controlled-test-key");
  assert.equal(payload.stream, true);
  const prompt = JSON.stringify(payload.messages);
  const userPrompt = payload.messages.at(-1)?.content ?? "";
  const latestQuestion = userPrompt.split("Latest question (untrusted data):\n").at(-1).trim();
  if (latestQuestion.includes("CONTROLLED_QUOTA")) {
    res.writeHead(429, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message: "PRIVATE_PROVIDER_FAILURE_DETAIL_DO_NOT_EXPOSE controlled-test-key",
          type: "insufficient_quota",
          code: "insufficient_quota",
        },
      }),
    );
    return;
  }
  const greeting = latestQuestion === "hi";
  const slow =
    prompt.includes("CONTROLLED_SLOW_TURN") && !prompt.includes("CONTROLLED_SUCCESSOR_TURN");
  const invalid = JSON.stringify(payload.messages).includes("CONTROLLED_INVALID_CITATION");
  const draft = {
    assistantAnswer: invalid
      ? "Unsupported provisional answer [input:invented]"
      : 'The operation received an undefined value [input:1].\n\nCheck the caller before reading the property.\n\n```typescript\nif (value == null) throw new Error("Missing required value");\n```',
    summary: "A property access failed on an undefined value.",
    primaryHypothesis: {
      id: "hypothesis-1",
      title: "Missing value at the access boundary",
      explanation:
        "The submitted TypeError reports an undefined receiver; the producer still needs inspection.",
      evidenceIds: ["input:1"],
      confidence: "low",
    },
    alternatives: [],
    remediation: [
      {
        title: "Inspect the value producer",
        detail:
          "Trace the input before the failing property access and establish its intended contract.",
        evidenceIds: ["input:1"],
      },
    ],
    verification: [
      {
        title: "Repeat the failing input",
        detail:
          "Run a small regression check with the same missing value and verify the intended behavior.",
        evidenceIds: ["input:1"],
      },
    ],
    missingInformation: ["The producer and caller code"],
    confidence: "low",
    limitations: ["The excerpt does not establish the origin of the missing value."],
  };
  if (greeting)
    Object.assign(draft, {
      assistantAnswer:
        "Hello! I can help debug errors, failing tests, logs, or relevant code. What are you working on?",
      summary: "The conversation has started without a failure excerpt.",
      primaryHypothesis: null,
      alternatives: [],
      remediation: [],
      verification: [],
      missingInformation: ["An error, relevant code, or debugging question"],
      confidence: "low",
      limitations: ["No technical failure has been supplied."],
    });
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
  const source = JSON.stringify(draft);
  const send = (content, finish_reason = null) =>
    res.write(
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason }] })}\n\n`,
    );
  send(source.slice(0, 55));
  const finish = () => {
    if (!res.destroyed) {
      for (let index = 55; index < source.length; index += 80)
        send(source.slice(index, index + 80));
      send("", "stop");
      res.end("data: [DONE]\n\n");
    }
  };
  const timer = setTimeout(finish, slow ? 10_000 : 20);
  delayed.add(timer);
  res.on("close", () => {
    clearTimeout(timer);
    delayed.delete(timer);
  });
});
await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
const address = provider.address();
assert.ok(address && typeof address === "object");
const worker = await unstable_dev("src/index.ts", {
  config: "wrangler.toml",
  local: true,
  vars: {
    OPENAI_API_KEY: "controlled-test-key",
    OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
    OPENAI_MODEL: "controlled/model",
  },
  experimental: { disableExperimentalWarning: true, forceLocal: true },
});
const headers = {
  "content-type": "application/json",
  authorization: `Bearer controlled_owner_${randomUUID()}`,
};
const call = (path, init = {}) => worker.fetch(`http://localhost${path}`, { headers, ...init });
const create = async () => {
  const r = await call("/api/threads", { method: "POST", body: "{}" });
  assert.equal(r.status, 201);
  return r.json();
};
const send = (id, message, clientTurnId = randomUUID(), extra = {}) =>
  call(`/api/threads/${id}/messages`, {
    method: "POST",
    headers: { ...headers, accept: "text/event-stream" },
    body: JSON.stringify({ schemaVersion: 1, message, clientTurnId, ...extra }),
  });
const read = (body) =>
  body
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice(5).trim()));
try {
  const thread = await create();
  const first = await send(
    thread.id,
    "TypeError: Cannot read properties of undefined (reading 'id')",
    randomUUID(),
    { environment: { runtime: "PERSISTED_RUNTIME_MARKER" } },
  );
  assert.equal(first.status, 200);
  const firstEvents = read(await first.text());
  const complete = firstEvents.find((event) => event.type === "message")?.message;
  assert.equal(complete?.mode, "ai");
  assert.ok(firstEvents.filter((event) => event.type === "delta").length > 1);
  assert.ok(complete.content.includes("```typescript"));
  assert.equal(firstEvents.at(-1).type, "done");
  const second = await send(thread.id, "Which caller should I inspect next?");
  assert.equal(second.status, 200);
  assert.equal(
    read(await second.text()).find((event) => event.type === "message")?.message.mode,
    "ai",
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[1].model, "controlled/model");
  const secondPrompt = JSON.stringify(calls[1].messages);
  assert.ok(secondPrompt.includes("PERSISTED_RUNTIME_MARKER"));
  assert.ok(secondPrompt.includes("Which caller should I inspect next?"));
  assert.ok(secondPrompt.includes("undefined"));
  const invalidThread = await create();
  const invalid = await send(invalidThread.id, "TypeError: undefined CONTROLLED_INVALID_CITATION");
  const invalidEvents = read(await invalid.text());
  assert.ok(
    invalidEvents.some((event) => event.type === "delta" && event.content.includes("Unsupported")),
  );
  const corrected = invalidEvents.find((event) => event.type === "message")?.message;
  assert.equal(corrected.mode, "deterministic");
  assert.ok(!corrected.content.includes("Unsupported provisional answer"));
  assert.ok(corrected.report.warnings.some((warning) => warning.code === "provider_fallback"));
  const slowThread = await create();
  const slowTurn = randomUUID();
  const slow = await send(slowThread.id, "TypeError: undefined CONTROLLED_SLOW_TURN", slowTurn);
  assert.equal(slow.status, 200);
  const reader = slow.body.getReader();
  const decoder = new TextDecoder();
  let seen = "";
  while (!seen.includes('"type":"delta"')) {
    const chunk = await reader.read();
    assert.ok(!chunk.done);
    seen += decoder.decode(chunk.value);
  }
  const staleStop = await call(`/api/threads/${slowThread.id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ clientTurnId: "another-turn" }),
  });
  assert.equal(staleStop.status, 409);
  const active = await call(`/api/threads/${slowThread.id}`);
  assert.equal((await active.json()).status, "running");
  const stop = await call(`/api/threads/${slowThread.id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ clientTurnId: slowTurn }),
  });
  assert.equal(stop.status, 200);
  const stopped = await stop.json();
  assert.equal(stopped.status, "idle");
  assert.equal(stopped.messages.at(-1).status, "cancelled");
  assert.equal(stopped.messages.at(-1).report, undefined);
  await reader.cancel();
  reader.releaseLock();
  const successor = await send(
    slowThread.id,
    "CONTROLLED_SUCCESSOR_TURN: what should I inspect next?",
  );
  assert.equal(successor.status, 200);
  const successorEvents = read(await successor.text());
  assert.equal(successorEvents.find((event) => event.type === "message")?.message.mode, "ai");
  assert.equal(successorEvents.at(-1).type, "done");
  assert.equal(calls.length, 5);

  const greetingThread = await create();
  const greetingResponse = await send(greetingThread.id, "hi");
  assert.equal(greetingResponse.status, 200);
  const greetingEvents = read(await greetingResponse.text());
  const greetingMessage = greetingEvents.find((event) => event.type === "message")?.message;
  assert.equal(greetingMessage?.mode, "ai");
  assert.equal(greetingMessage.status, "complete");
  assert.equal(greetingMessage.report.kind, "unknown");
  assert.equal(greetingMessage.report.primaryHypothesis, null);
  assert.deepEqual(greetingMessage.report.remediation, []);
  assert.deepEqual(greetingMessage.report.verification, []);
  assert.match(greetingMessage.content, /^Hello!/);
  assert.ok(
    !greetingMessage.report.warnings.some((warning) => warning.code === "provider_fallback"),
  );
  assert.equal(greetingEvents.at(-1).type, "done");
  const reopenedGreeting = await call(`/api/threads/${greetingThread.id}`);
  const savedGreeting = await reopenedGreeting.json();
  assert.equal(savedGreeting.messages.length, 2);
  assert.equal(savedGreeting.messages[0].content, "hi");
  assert.equal(savedGreeting.messages[1].content, greetingMessage.content);
  assert.equal(savedGreeting.messages[1].mode, "ai");

  const introducedFailure =
    "TypeError: Cannot read properties of undefined (reading 'id')\n    at lookupProfile (src/profile.ts:11:5)";
  const investigation = await send(greetingThread.id, introducedFailure);
  assert.equal(investigation.status, 200);
  const investigationMessage = read(await investigation.text()).find(
    (event) => event.type === "message",
  )?.message;
  assert.equal(investigationMessage?.mode, "ai");
  assert.equal(investigationMessage.report.kind, "runtime_exception");
  assert.ok(
    investigationMessage.report.observations.some((finding) =>
      finding.message.includes("TypeError"),
    ),
  );
  assert.ok(
    investigationMessage.report.evidence.some((item) =>
      item.content.includes("src/profile.ts:11:5"),
    ),
  );
  const verifyQuestion = "How should I verify the caller now?";
  const afterGreetingFollowup = await send(greetingThread.id, verifyQuestion);
  assert.equal(afterGreetingFollowup.status, 200);
  const followupMessage = read(await afterGreetingFollowup.text()).find(
    (event) => event.type === "message",
  )?.message;
  assert.equal(followupMessage?.mode, "ai");
  assert.equal(followupMessage.report.kind, "runtime_exception");
  assert.ok(
    followupMessage.report.observations.some((finding) => finding.message.includes("TypeError")),
  );
  assert.ok(
    followupMessage.report.evidence.some((item) => item.content.includes("src/profile.ts:11:5")),
  );
  const afterGreetingPrompt = JSON.stringify(calls.at(-1).messages);
  assert.ok(afterGreetingPrompt.includes(verifyQuestion));
  assert.ok(afterGreetingPrompt.includes("lookupProfile"));
  const reopenedInvestigation = await call(`/api/threads/${greetingThread.id}`);
  assert.equal((await reopenedInvestigation.json()).messages.length, 6);

  const quotaThread = await create();
  const quota = await send(quotaThread.id, "TypeError: undefined CONTROLLED_QUOTA");
  assert.equal(quota.status, 200);
  const quotaBody = await quota.text();
  const quotaMessage = read(quotaBody).find((event) => event.type === "message")?.message;
  assert.equal(quotaMessage?.mode, "deterministic");
  assert.ok(quotaMessage.report.warnings.some((warning) => warning.code === "provider_quota"));
  assert.ok(!quotaBody.includes("PRIVATE_PROVIDER_FAILURE_DETAIL_DO_NOT_EXPOSE"));
  assert.ok(!quotaBody.includes("controlled-test-key"));
  assert.equal(calls.length, 9);
  console.log(
    "Controlled provider API: real HTTP SSE text, consistent custom model/base URL, persisted follow-up environment, citation fallback, greeting persistence and transition to investigation, safe quota diagnostics, and turn-specific live cancellation passed; no external model calls",
  );
} finally {
  await worker.stop();
  for (const timer of delayed) clearTimeout(timer);
  provider.closeAllConnections();
  await new Promise((resolve) => provider.close(resolve));
}
