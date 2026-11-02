import { indexTokens } from "./runbookIndex.js";

export const EMBEDDING_DIMENSIONS = 64;
const EMBEDDING_MODEL = "text-embedding-3-small";

export interface Embedder {
  embed(text: string): Promise<number[]>;
}

export function createEmbedder(
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Embedder {
  if (!apiKey?.trim()) {
    return { embed: async (text) => hashEmbed(text) };
  }
  return {
    async embed(text: string): Promise<number[]> {
      if (text.length > 8000 || !text.trim())
        throw new Error("Embedding input must contain 1 to 8000 characters");
      const response = await fetchImpl("https://api.openai.com/v1/embeddings", {
        method: "POST",
        signal: AbortSignal.timeout(8000),
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: text,
          dimensions: EMBEDDING_DIMENSIONS,
        }),
      });
      if (!response.ok) throw new Error(`OpenAI embeddings failed with ${response.status}`);
      const payload: unknown = JSON.parse(await boundedEmbeddingBody(response));
      const first: unknown =
        record(payload) && Array.isArray(payload.data) ? payload.data[0] : undefined;
      const embedding: unknown = record(first) ? first.embedding : undefined;
      if (
        !Array.isArray(embedding) ||
        embedding.length !== EMBEDDING_DIMENSIONS ||
        !embedding.every(
          (value: unknown): value is number => typeof value === "number" && Number.isFinite(value),
        )
      ) {
        throw new Error("OpenAI embeddings response must contain 64 finite values");
      }
      return embedding;
    },
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function boundedEmbeddingBody(response: Response): Promise<string> {
  const limit = 16_384;
  if (Number(response.headers.get("content-length") ?? 0) > limit || !response.body)
    throw new Error("Embedding response exceeds size limit or is empty");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let result = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new Error("Embedding response exceeds size limit");
      }
      result += decoder.decode(chunk.value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
export function hashEmbed(text: string): number[] {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  for (const token of indexTokens(text)) {
    const bucket = hashToken(token) % EMBEDDING_DIMENSIONS;
    const current = vector[bucket] ?? 0;
    vector[bucket] = current + 1;
  }
  return normalize(vector);
}

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return vector;
  }
  return vector.map((value) => value / norm);
}
