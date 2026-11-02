import assert from "node:assert/strict";
import { unstable_dev } from "wrangler";

const worker = await unstable_dev("src/index.ts", {
  config: "wrangler.toml",
  local: true,
  vars: { OPENAI_API_KEY: "" },
  experimental: { disableExperimentalWarning: true, forceLocal: true },
});
const key = "integration_owner_" + "a".repeat(32);
const other = "integration_owner_" + "b".repeat(32);
const headers = { "content-type": "application/json", authorization: `Bearer ${key}` };
async function submit(rawInput, requestedKind, extra = {}) {
  return worker.fetch("http://localhost/api/investigations", {
    method: "POST",
    headers,
    body: JSON.stringify({
      schemaVersion: 1,
      rawInput,
      ...(requestedKind ? { requestedKind } : {}),
      ...extra,
    }),
  });
}
try {
  const unauthenticated = await worker.fetch("http://localhost/api/investigations");
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.headers.get("cache-control"), "no-store");
  const invalid = await submit("   ");
  assert.equal(invalid.status, 400);
  const malformed = await worker.fetch("http://localhost/api/investigations", {
    method: "POST",
    headers,
    body: "{",
  });
  assert.equal(malformed.status, 400);
  const oversized = await submit("x".repeat(70_000));
  assert.equal(oversized.status, 413);
  const unicodeOversized = await submit("ðŸ§­".repeat(17_000));
  assert.equal(unicodeOversized.status, 413);
  const cases = [
    [
      "Traceback (most recent call last):\n  File \"app.py\", line 8, in main\n    user.name\nAttributeError: 'NoneType' object has no attribute 'name'",
      "runtime_exception",
    ],
    [
      "TypeError: Cannot read properties of undefined (reading 'id')\n    at handle (src/api.ts:9:4)",
      "runtime_exception",
    ],
    [
      "FAIL src/user.test.ts\nAssertionError: expected 200 to equal 201\nExpected: 201\nReceived: 200",
      "test_failure",
    ],
    ["HTTP/1.1 429 Too Many Requests\nRetry-After: 60\nGET /api/users", "http_error"],
    [
      '{"level":"error","time":"2026-11-01T10:00:00Z","message":"connection timeout","requestId":"req-123"}',
      "application_log",
    ],
    ["DROP TABLE sessions;", "sql_migration"],
    [
      'ERROR: duplicate key value violates unique constraint "users_email_key"\nSQLSTATE: 23505',
      "database_error",
    ],
  ];
  const ids = [];
  for (const [rawInput, kind] of cases) {
    const response = await submit(rawInput);
    assert.equal(response.status, 200, `${kind}: ${await response.clone().text()}`);
    const report = await response.json();
    ids.push(report.sessionId);
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.kind, kind);
    assert.equal(report.mode, "deterministic");
    assert.ok(report.evidence.length);
    assert.ok(report.remediation.length && report.verification.length);
    assert.ok(report.warnings.some((warning) => warning.code === "provider_not_configured"));
    const actual = new Set(report.evidence.map((item) => item.id));
    for (const finding of report.observations)
      assert.ok(finding.evidenceIds.every((id) => actual.has(id)));
    if (kind === "sql_migration")
      assert.ok(report.observations.some((finding) => finding.code === "sql_data_loss"));
  }
  const listing = await worker.fetch("http://localhost/api/investigations", { headers });
  assert.equal(listing.status, 200);
  const history = (await listing.json()).investigations;
  assert.ok(
    ids.every((id) => history.some((entry) => entry.id === id && entry.status === "complete")),
  );
  const detail = await worker.fetch(`http://localhost/api/investigations/${ids[0]}`, { headers });
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).sessionId, ids[0]);
  const privateList = await worker.fetch("http://localhost/api/investigations", {
    headers: { authorization: `Bearer ${other}` },
  });
  assert.deepEqual((await privateList.json()).investigations, []);
  const privateDetail = await worker.fetch(`http://localhost/api/investigations/${ids[0]}`, {
    headers: { authorization: `Bearer ${other}` },
  });
  assert.equal(privateDetail.status, 404);
  const streamed = await worker.fetch("http://localhost/api/investigations", {
    method: "POST",
    headers: { ...headers, accept: "text/event-stream" },
    body: JSON.stringify({ schemaVersion: 1, rawInput: "HTTP/1.1 401 Unauthorized" }),
  });
  assert.equal(streamed.status, 200);
  assert.equal(streamed.headers.get("cache-control"), "no-store");
  const events = (await streamed.text())
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice(5).trim()));
  assert.deepEqual(
    events.filter((event) => event.type === "stage").map((event) => event.stage),
    ["validating", "parsing", "retrieving", "investigating", "validating_evidence", "persisting"],
  );
  assert.ok(events.some((event) => event.type === "report"));
  assert.equal(events.at(-1).type, "done");
  const removed = await worker.fetch(`http://localhost/api/investigations/${ids[0]}`, {
    method: "DELETE",
    headers,
  });
  assert.equal(removed.status, 200);
  assert.equal(
    (await worker.fetch(`http://localhost/api/investigations/${ids[0]}`, { headers })).status,
    404,
  );
  const maxSqlResponse = await submit("DROP TABLE boundary_test;".padEnd(32768, " "));
  assert.equal(maxSqlResponse.status, 200);
  assert.equal((await maxSqlResponse.json()).kind, "sql_migration");
  assert.equal((await submit("HTTP 500 Internal Server Error")).status, 200);
  const limited = await submit("HTTP 500 Internal Server Error");
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
  const legacyRead = await worker.fetch("http://localhost/api/sessions/nonexistent");
  assert.equal(legacyRead.status, 401);
  const legacyParseOversized = await worker.fetch("http://localhost/api/parse", {
    method: "POST",
    headers,
    body: JSON.stringify({ sql: "x".repeat(70_000) }),
  });
  assert.equal(legacyParseOversized.status, 413);
  console.log(
    "Investigation API: seven representative failures, D1 persistence/history, privacy, SSE stages, deletion, malformed/oversized inputs and legacy authorization passed",
  );
} finally {
  await worker.stop();
}
