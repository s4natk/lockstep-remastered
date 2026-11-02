import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { unstable_dev } from "wrangler";

const worker = await unstable_dev("src/index.ts", {
  config: "wrangler.toml",
  local: true,
  vars: { OPENAI_API_KEY: "" },
  experimental: { disableExperimentalWarning: true, forceLocal: true },
});
const owner = `threads_owner_${randomUUID()}`;
const other = `threads_other_${randomUUID()}`;
const headers = { "content-type": "application/json", authorization: `Bearer ${owner}` };
const otherHeaders = { ...headers, authorization: `Bearer ${other}` };
async function request(path, options = {}) {
  return worker.fetch(`http://localhost${path}`, { headers, ...options });
}
async function json(path, options = {}) {
  const response = await request(path, options);
  assert.equal(
    response.status < 300,
    true,
    `${path}: ${response.status} ${await response.clone().text()}`,
  );
  return response.json();
}
function events(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice(5).trim()));
}
async function send(threadId, message, clientTurnId = randomUUID(), extra = {}, streaming = true) {
  return request(`/api/threads/${threadId}/messages`, {
    method: "POST",
    headers: { ...headers, ...(streaming ? { accept: "text/event-stream" } : {}) },
    body: JSON.stringify({ schemaVersion: 1, message, clientTurnId, ...extra }),
  });
}
try {
  assert.equal((await worker.fetch("http://localhost/api/threads")).status, 401);
  const bad = await request("/api/threads", { method: "POST", body: "{" });
  assert.equal(bad.status, 400);
  const thread = await json("/api/threads", { method: "POST", body: "{}" });
  assert.equal(thread.status, "idle");
  assert.deepEqual(thread.messages, []);
  const knowledge = await json("/api/knowledge", {
    method: "POST",
    body: JSON.stringify({
      schemaVersion: 1,
      title: "Customer lookup runbook",
      kind: "document",
      content:
        "PRIVATE_LOOKUP_GUIDE: Customer lookup requires a defined customer object. Inspect customer.id at the request boundary. Reproduce missing customer input with a safe fixture.",
    }),
  });
  const pinned = await json(`/api/threads/${thread.id}/context`, {
    method: "PATCH",
    body: JSON.stringify({ schemaVersion: 1, contextIds: [knowledge.id] }),
  });
  assert.deepEqual(pinned.contextIds, [knowledge.id]);
  const turnId = randomUUID();
  const raw =
    "\nTypeError: Cannot read properties of undefined (reading 'id')\n    at lookupCustomer (src/customer.ts:12:4)";
  const response = await send(thread.id, raw, turnId);
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get("cache-control"), "no-store");
  const sequence = events(await response.text());
  const final = sequence.find((event) => event.type === "message")?.message;
  assert.ok(final);
  assert.equal(final.role, "assistant");
  assert.equal(final.status, "complete");
  assert.equal(final.mode, "deterministic");
  assert.equal(final.report.kind, "runtime_exception");
  assert.ok(
    final.report.evidence.some(
      (item) => item.kind === "context" && item.content.includes("PRIVATE_LOOKUP_GUIDE"),
    ),
  );
  assert.ok(sequence.some((event) => event.type === "delta"));
  assert.ok(
    sequence
      .filter((event) => event.type === "stage")
      .every(
        (event) =>
          event.schemaVersion === 1 && event.threadId === thread.id && event.turnId === turnId,
      ),
  );
  assert.ok(
    sequence.filter((event) => event.type === "thread").every((event) => event.thread.title.trim()),
  );
  assert.equal(sequence.at(-1).type, "done");
  const saved = await json(`/api/threads/${thread.id}`);
  assert.equal(saved.messages.length, 2);
  assert.equal(saved.messages[0].content, raw);
  assert.equal(saved.status, "idle");
  const replay = await send(thread.id, raw, turnId);
  assert.equal(replay.status, 200);
  assert.equal(
    events(await replay.text()).find((event) => event.type === "message").message.id,
    final.id,
  );
  assert.equal((await json(`/api/threads/${thread.id}`)).messages.length, 2);
  assert.equal((await send(thread.id, "Changed request", turnId)).status, 409);
  const followup = await send(
    thread.id,
    "Can you show a safe example fix?",
    randomUUID(),
    {},
    false,
  );
  assert.equal(followup.status, 200, await followup.clone().text());
  const next = (await followup.json()).message;
  assert.equal(next.report.kind, "runtime_exception");
  assert.ok(next.content.includes("```"));
  assert.ok(next.report.observations.some((finding) => finding.message.includes("TypeError")));
  const continued = await json(`/api/threads/${thread.id}`);
  assert.equal(continued.messages.length, 4);
  assert.deepEqual(continued.contextIds, [knowledge.id]);
  const http = await send(
    thread.id,
    "HTTP/1.1 429 Too Many Requests\nRetry-After: 30",
    randomUUID(),
    {},
    false,
  );
  assert.equal(http.status, 200);
  assert.equal((await http.json()).message.report.kind, "http_error");
  for (const [path, method, body] of [
    [`/api/threads/${thread.id}`, "GET"],
    [`/api/threads/${thread.id}`, "DELETE"],
    [`/api/threads/${thread.id}/cancel`, "POST", "{}"],
    [
      `/api/threads/${thread.id}/context`,
      "PATCH",
      JSON.stringify({ schemaVersion: 1, contextIds: [] }),
    ],
    [
      `/api/threads/${thread.id}/messages`,
      "POST",
      JSON.stringify({
        schemaVersion: 1,
        message: "Read private data",
        clientTurnId: randomUUID(),
      }),
    ],
  ]) {
    const privateResponse = await worker.fetch(`http://localhost${path}`, {
      method,
      headers: otherHeaders,
      ...(body ? { body } : {}),
    });
    assert.equal(privateResponse.status, 404, `${method} ${path}`);
  }
  const privateList = await worker.fetch("http://localhost/api/threads", { headers: otherHeaders });
  assert.deepEqual((await privateList.json()).threads, []);
  const foreignPin = await worker.fetch(`http://localhost/api/threads/${thread.id}/context`, {
    method: "PATCH",
    headers: otherHeaders,
    body: JSON.stringify({ schemaVersion: 1, contextIds: [knowledge.id] }),
  });
  assert.equal(foreignPin.status, 404);
  const invalidPin = await request(`/api/threads/${thread.id}/context`, {
    method: "PATCH",
    body: JSON.stringify({ schemaVersion: 1, contextIds: [randomUUID()] }),
  });
  assert.equal(invalidPin.status, 404);
  const invalid = await send(thread.id, "   ");
  assert.equal(invalid.status, 400);
  const oversized = await send(thread.id, "x".repeat(70_000));
  assert.equal(oversized.status, 413);
  const cancelledIdle = await json(`/api/threads/${thread.id}/cancel`, {
    method: "POST",
    body: "{}",
  });
  assert.equal(cancelledIdle.status, "idle");
  assert.equal(cancelledIdle.messages.length, 6);
  const sql = await json("/api/threads", {
    method: "POST",
    body: JSON.stringify({ title: "SQL specialist inside sidekick" }),
  });
  const sqlResponse = await send(sql.id, "DROP TABLE sessions;", randomUUID(), {}, false);
  assert.equal(sqlResponse.status, 200);
  const sqlMessage = (await sqlResponse.json()).message;
  assert.ok(sqlMessage.report.observations.some((finding) => finding.code === "sql_data_loss"));
  const legacyResponse = await request("/api/investigations", {
    method: "POST",
    body: JSON.stringify({ schemaVersion: 1, rawInput: "HTTP 401 Unauthorized" }),
  });
  assert.equal(legacyResponse.status, 200);
  const legacy = await legacyResponse.json();
  const list = await json("/api/threads");
  const imported = list.threads.find((item) => item.id === `legacy-${legacy.sessionId}`);
  assert.ok(imported);
  assert.equal((await json(`/api/threads/${imported.id}`)).messages.length, 2);
  await json(`/api/threads/${imported.id}`, { method: "DELETE" });
  assert.ok(!(await json("/api/threads")).threads.some((item) => item.id === imported.id));
  await json(`/api/knowledge/${knowledge.id}`, { method: "DELETE" });
  const reopenedAfterDelete = await json(`/api/threads/${thread.id}`);
  assert.deepEqual(reopenedAfterDelete.contextIds, []);
  const afterDelete = await send(
    thread.id,
    "How do I verify the request rate?",
    randomUUID(),
    { contextIds: reopenedAfterDelete.contextIds },
    false,
  );
  assert.equal(afterDelete.status, 200);
  assert.deepEqual((await json(`/api/threads/${thread.id}`)).contextIds, []);
  await json(`/api/threads/${thread.id}`, { method: "DELETE" });
  assert.equal((await request(`/api/threads/${thread.id}`)).status, 404);
  console.log(
    "Sidekick API: durable multi-turn memory, private context retrieval, real graph stages, idempotent sends, ownership, cancellation state, legacy migration, SQL specialist and deletion passed",
  );
} finally {
  await worker.stop();
}
