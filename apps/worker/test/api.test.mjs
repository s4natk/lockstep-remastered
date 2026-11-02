import assert from "node:assert/strict";
import { unstable_dev } from "wrangler";

const worker = await unstable_dev("src/index.ts", {
  config: "wrangler.toml",
  local: true,
  experimental: {
    disableExperimentalWarning: true,
    forceLocal: true,
  },
});

try {
  const root = await worker.fetch("http://localhost/");
  assert.equal(root.status, 200);
  assert.equal((await root.json()).ok, true);

  const health = await worker.fetch("http://localhost/health", {
    headers: { Origin: "http://localhost:3000" },
  });
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("access-control-allow-origin"), "http://localhost:3000");
  const healthBody = await health.json();
  assert.equal(healthBody.ok, true);
  assert.equal(typeof healthBody.timestamp, "string");
  assert.equal(healthBody.openai.configured, false);
  assert.equal(healthBody.openai.mode, "mock");

  const deployed = await worker.fetch("http://localhost/health", {
    headers: { Origin: "https://lockstep-eta.vercel.app" },
  });
  assert.equal(deployed.headers.get("access-control-allow-origin"), "https://lockstep-eta.vercel.app");

  const unknown = await worker.fetch("http://localhost/health", {
    headers: { Origin: "https://example.com" },
  });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.headers.get("access-control-allow-origin"), null);

  const missing = await worker.fetch("http://localhost/api/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sql: "   " }),
  });
  assert.equal(missing.status, 400);
  assert.deepEqual(await missing.json(), { error: "sql is required" });

  const badJson = await worker.fetch("http://localhost/api/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.equal(badJson.status, 400);
  const badJsonBody = await badJson.json();
  assert.equal(typeof badJsonBody.error, "string");
  assert.ok(badJsonBody.error.length > 0);

  const parsed = await worker.fetch("http://localhost/api/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sql: "DROP TABLE sessions" }),
  });
  assert.equal(parsed.status, 200);
  const result = await parsed.json();
  assert.equal(result.statements.length, 1);
  assert.equal(result.hazards[0].code, "data_loss");
  assert.equal(result.hazards[0].statementIndex, 0);

  const invalid = await worker.fetch("http://localhost/api/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sql: "ALTER TABLE" }),
  });
  assert.equal(invalid.status, 400);
  const invalidBody = await invalid.json();
  assert.equal(typeof invalidBody.error, "string");
  assert.ok(invalidBody.error.length > 0);
} finally {
  await worker.stop();
}
