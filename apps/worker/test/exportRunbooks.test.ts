import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportRunbooks } from "../scripts/exportRunbooks.ts";
import { investigationRunbooks } from "../src/investigationRunbooks.ts";

const directory = await mkdtemp(join(tmpdir(), "lockstep-vector-export-"));
const output = join(directory, "runbooks.ndjson");
try {
  const missing = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--import",
      "./test/register-ts.mjs",
      "scripts/exportRunbooks.ts",
      output,
    ],
    { encoding: "utf8", env: { ...process.env, OPENAI_API_KEY: "" } },
  );
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /OPENAI_API_KEY is required/);
  await assert.rejects(() => readFile(output));
  await assert.rejects(() => exportRunbooks(output, { apiKey: " " }), /OPENAI_API_KEY/);
  const embeddedInputs: string[] = [];
  const providerRequests: Array<{ url: string; model: string }> = [];
  const fakeFetch: typeof fetch = async (url, init) => {
    const request = JSON.parse(String(init?.body)) as {
      input: string;
      dimensions: number;
      model: string;
    };
    assert.equal(request.dimensions, 64);
    providerRequests.push({ url: String(url), model: request.model });
    embeddedInputs.push(request.input);
    return Response.json({
      data: [{ embedding: Array.from({ length: 64 }, (_, index) => index / 100) }],
    });
  };
  assert.equal(
    await exportRunbooks(output, {
      apiKey: "test-key",
      fetchImpl: fakeFetch,
      baseUrl: "https://proxy.example.test/v1",
      embeddingModel: "custom-embedding-model",
    }),
    investigationRunbooks.length,
  );
  assert.ok(
    providerRequests.every(
      (request) =>
        request.url === "https://proxy.example.test/v1/embeddings" &&
        request.model === "custom-embedding-model",
    ),
  );
  const records = (await readFile(output, "utf8"))
    .trim()
    .split("\n")
    .map(
      (line) => JSON.parse(line) as { id: string; values: number[]; metadata: { title: string } },
    );
  assert.deepEqual(
    embeddedInputs,
    investigationRunbooks.map((runbook) => runbook.text),
  );
  assert.deepEqual(
    records.map((record) => record.id),
    investigationRunbooks.map((runbook) => runbook.id),
  );
  assert.ok(
    records.every((record) => record.values.length === 64 && record.values.every(Number.isFinite)),
  );
  assert.deepEqual(
    records.map((record) => record.metadata.title),
    investigationRunbooks.map((runbook) => runbook.title),
  );
  const existing = join(directory, "existing.ndjson");
  await writeFile(existing, "preserve this file");
  await assert.rejects(() =>
    exportRunbooks(existing, { apiKey: "test-key", fetchImpl: fakeFetch }),
  );
  assert.equal(await readFile(existing, "utf8"), "preserve this file");
  const failed = join(directory, "failed.ndjson");
  await assert.rejects(() =>
    exportRunbooks(failed, {
      apiKey: "test-key",
      fetchImpl: async () => new Response("unavailable", { status: 503 }),
    }),
  );
  await assert.rejects(() => readFile(failed));
  console.log(
    "Runbook export: required credentials, public-only corpus, Vectorize IDs/dimensions, custom provider settings, provider failures and overwrite protection passed",
  );
} finally {
  for (const filename of ["runbooks.ndjson", "existing.ndjson", "failed.ndjson"]) {
    await rm(join(directory, filename), { force: true });
  }
  await rmdir(directory);
}
