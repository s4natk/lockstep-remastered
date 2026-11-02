import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createEnvEmbedder } from "../src/embeddings.ts";
import { investigationRunbooks } from "../src/investigationRunbooks.ts";

export async function exportRunbooks(
  outputPath: string,
  options: {
    apiKey: string | undefined;
    fetchImpl?: typeof fetch;
    baseUrl?: string;
    embeddingModel?: string;
  },
): Promise<number> {
  if (!options.apiKey?.trim()) {
    throw new Error(
      "OPENAI_API_KEY is required; hash embeddings cannot populate a semantic index.",
    );
  }
  const embedder = createEnvEmbedder(
    {
      OPENAI_API_KEY: options.apiKey,
      OPENAI_BASE_URL: options.baseUrl,
      OPENAI_EMBEDDING_MODEL: options.embeddingModel,
    },
    options.fetchImpl,
  );
  const records: string[] = [];
  for (const runbook of investigationRunbooks) {
    const values = await embedder.embed(runbook.text);
    records.push(JSON.stringify({ id: runbook.id, values, metadata: { title: runbook.title } }));
  }
  await writeFile(outputPath, `${records.join("\n")}\n`, { encoding: "utf8", flag: "wx" });
  return records.length;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const outputPath = process.argv[2] ?? "runbook-vectors.ndjson";
  if (process.argv.length > 3) {
    console.error("Usage: exportRunbooks.ts [output.ndjson]");
    process.exitCode = 1;
  } else if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error("OPENAI_API_KEY is required; no vectors were generated.");
    process.exitCode = 1;
  } else {
    try {
      const count = await exportRunbooks(outputPath, {
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.OPENAI_BASE_URL,
        embeddingModel: process.env.OPENAI_EMBEDDING_MODEL,
      });
      console.log(`Exported ${count} public runbook vectors (64 dimensions).`);
    } catch {
      console.error(
        "Runbook export failed. Check provider availability and use a new writable output path.",
      );
      process.exitCode = 1;
    }
  }
}
