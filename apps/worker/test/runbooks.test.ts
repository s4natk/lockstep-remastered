import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { searchRunbooks } from "../src/runbookIndex.ts";
import { runbookChunks } from "../src/runbookChunks.ts";

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

assert.equal(chunks.length, 15);
assert.deepEqual(
  runbookChunks.map((chunk) => chunk.id),
  chunks.map((chunk) => chunk.id).sort(),
);
for (const chunk of chunks) {
  const bundled = runbookChunks.find((candidate) => candidate.id === chunk.id);
  assert.equal(bundled?.text, chunk.text, chunk.id);
  assert.ok(
    questions.some((question) => question.chunkId === chunk.id),
    `no eval question targets ${chunk.id}`,
  );
}

// The first question listed for each chunk is its canonical phrasing; the rest are paraphrases.
const canonical = chunks.map((chunk) => questions.find((question) => question.chunkId === chunk.id)!);
for (const question of canonical) {
  const [top] = searchRunbooks(chunks, question.query, 3);
  assert.ok(top, question.query);
  assert.equal(top.id, question.chunkId, question.query);
}
