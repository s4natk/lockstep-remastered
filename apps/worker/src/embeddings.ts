import { indexTokens } from "./runbookIndex.js";

export const EMBEDDING_DIMENSIONS = 64;
const EMBEDDING_MODEL = "text-embedding-3-small";

export interface Embedder {
  embed(text: string): Promise<number[]>;
}

export function createEmbedder(apiKey: string | undefined, fetchImpl: typeof fetch = fetch): Embedder {
  if (apiKey === undefined || apiKey === "") {
    return { embed: async (text) => hashEmbed(text) };
  }
  return {
    async embed(text: string): Promise<number[]> {
      const response = await fetchImpl("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: text,
          dimensions: EMBEDDING_DIMENSIONS,
        }),
      });
      if (!response.ok) {
        throw new Error(`OpenAI embeddings failed with ${response.status}`);
      }
      const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
      const embedding = payload.data?.[0]?.embedding;
      if (embedding === undefined) {
        throw new Error("OpenAI embeddings response was empty");
      }
      return embedding;
    },
  };
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
