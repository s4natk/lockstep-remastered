import assert from "node:assert/strict";
import { createEmbedder, EMBEDDING_DIMENSIONS } from "../src/embeddings.ts";
const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => index / 100);
let options: RequestInit | undefined;
const mockFetch: typeof fetch = async (_url, init) => {
  options = init;
  return Response.json({ data: [{ embedding: vector }] });
};
const embedder = createEmbedder("test-key", mockFetch);
assert.deepEqual(await embedder.embed("TypeError undefined"), vector);
assert.ok(options?.signal);
assert.equal(JSON.parse(String(options?.body)).dimensions, 64);
for (const embedding of [
  [],
  vector.slice(1),
  [...vector, 1],
  vector.map(() => "1"),
  vector.map(() => null),
]) {
  await assert.rejects(() =>
    createEmbedder("test-key", async () => Response.json({ data: [{ embedding }] })).embed(
      "failure",
    ),
  );
}
for (const payload of ["{", "{}", "x".repeat(16385)]) {
  await assert.rejects(() =>
    createEmbedder("test-key", async () => new Response(payload)).embed("failure"),
  );
}
await assert.rejects(() => embedder.embed("x".repeat(8001)));
await assert.rejects(() => embedder.embed("   "));
await assert.rejects(() =>
  createEmbedder("test-key", async () => new Response("provider error", { status: 500 })).embed(
    "failure",
  ),
);
let called = false;
const fallback = createEmbedder(" ", async () => {
  called = true;
  throw new Error("must not call provider");
});
assert.equal((await fallback.embed("keyword fallback")).length, 64);
assert.equal(called, false);
console.log(
  "Embeddings: finite 64-dimensional vectors, bounded input/output, timeout signal, provider errors and no-key fallback passed",
);
