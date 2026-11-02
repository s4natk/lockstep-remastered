import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createEmbedder } from "../src/embeddings.ts";
import { hybridSearch, reciprocalRankFusion } from "../src/hybridSearch.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const runbookDir = join(root, "eval/runbooks");
const chunks = readdirSync(runbookDir)
  .filter((name) => name.endsWith(".md"))
  .map((name) => ({
    id: name.slice(0, -".md".length),
    text: readFileSync(join(runbookDir, name), "utf8").trim(),
  }));
const questions = JSON.parse(readFileSync(join(runbookDir, "questions.json"), "utf8")) as Array<{
  query: string;
  chunkId: string;
}>;

const fused = reciprocalRankFusion([
  ["drop-table", "truncate"],
  ["truncate", "drop-column"],
]);
assert.equal(fused[0], "truncate");

let fetches = 0;
const embedder = createEmbedder(undefined, async () => {
  fetches += 1;
  throw new Error("OpenAI should not be called");
});
const first = await embedder.embed("DROP TABLE deletes the table");
const second = await embedder.embed("DROP TABLE deletes the table");
assert.deepEqual(first, second);
assert.equal(fetches, 0);

// The first question listed for each chunk is its canonical phrasing; the rest are paraphrases.
const canonical = chunks.map((chunk) => questions.find((question) => question.chunkId === chunk.id)!);
for (const question of canonical) {
  const [top] = await hybridSearch({ chunks, query: question.query, embedder, limit: 3 });
  assert.ok(top, question.query);
  assert.equal(top.id, question.chunkId, question.query);
}

let hits = 0;
for (const question of questions) {
  const found = await hybridSearch({ chunks, query: question.query, embedder, limit: 3 });
  if (found.some((chunk) => chunk.id === question.chunkId)) {
    hits += 1;
  }
}
assert.ok(hits / questions.length >= 0.9, `recall@3 fell to ${hits}/${questions.length}`);

const vectorize = {
  async query(): Promise<{ matches: Array<{ id: string }> }> {
    return { matches: [{ id: "lock-timeout" }] };
  },
};
const [fromVectorize] = await hybridSearch({
  chunks,
  query: "Why set lock_timeout before DDL?",
  embedder,
  vectorize,
  limit: 3,
});
assert.equal(fromVectorize?.id, "lock-timeout");
assert.equal(fetches, 0);

const unavailable = {
  async query(): Promise<{ matches: Array<{ id: string }> }> {
    throw new Error("Binding VECTORIZE needs to be run remotely");
  },
};
const [fallback] = await hybridSearch({
  chunks,
  query: "DROP TABLE deletes the table and its rows",
  embedder,
  vectorize: unavailable,
  limit: 3,
});
assert.equal(fallback?.id, "drop-table");
