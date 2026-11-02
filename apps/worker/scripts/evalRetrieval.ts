import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createEmbedder } from "../src/embeddings.js";
import { hybridSearch } from "../src/hybridSearch.js";

const runbookDir = join(dirname(fileURLToPath(import.meta.url)), "../../../eval/runbooks");
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

const apiKey = process.env.OPENAI_API_KEY;
const embedder = createEmbedder(apiKey);
let hits = 0;
const misses: string[] = [];
for (const question of questions) {
  const found = await hybridSearch({ chunks, query: question.query, embedder, limit: 3 });
  if (found.some((chunk) => chunk.id === question.chunkId)) {
    hits += 1;
  } else {
    misses.push(question.chunkId);
  }
}

const recall = questions.length === 0 ? 0 : hits / questions.length;
console.log(`embedder ${apiKey ? "openai" : "local-hash"}`);
console.log(`recall@3 ${hits}/${questions.length} ${recall.toFixed(3)}`);
if (misses.length > 0) {
  console.log(`misses ${misses.join(",")}`);
}
