import type { Embedder } from "./embeddings.js";
import { searchRunbooks, type SearchableChunk } from "./runbookIndex.js";
import { withSpan } from "./tracing.js";

const RRF_K = 60;

export interface VectorSearch {
  query(
    vector: number[],
    options?: { topK?: number },
  ): Promise<{ matches: Array<{ id: string }> }>;
}

export function reciprocalRankFusion(rankings: string[][], k = RRF_K): string[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }
  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([id]) => id);
}

export function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let score = 0;
  for (let index = 0; index < length; index += 1) {
    score += (left[index] ?? 0) * (right[index] ?? 0);
  }
  return score;
}

export async function hybridSearch(options: {
  chunks: SearchableChunk[];
  query: string;
  embedder: Embedder;
  vectorize?: VectorSearch;
  limit?: number;
}): Promise<SearchableChunk[]> {
  const limit = options.limit ?? 3;
  const keywordIds = searchRunbooks(options.chunks, options.query, options.chunks.length).map(
    (chunk) => chunk.id,
  );
  const vectorize = options.vectorize;
  const vectorIds = vectorize
    ? await vectorIdsOrLocal(vectorize, options.chunks, options.embedder, options.query, limit)
    : await withSpan("retrieval.embed", () => localVectorIds(options.chunks, options.embedder, options.query));
  const fused = reciprocalRankFusion([keywordIds, vectorIds]).slice(0, limit);
  const byId = new Map(options.chunks.map((chunk) => [chunk.id, chunk]));
  return fused.flatMap((id) => {
    const chunk = byId.get(id);
    return chunk === undefined ? [] : [chunk];
  });
}

async function vectorIdsOrLocal(
  vectorize: VectorSearch,
  chunks: SearchableChunk[],
  embedder: Embedder,
  query: string,
  limit: number,
): Promise<string[]> {
  try {
    return await withSpan("retrieval.vectorize", () => vectorizeIds(vectorize, embedder, query, limit));
  } catch {
    return withSpan("retrieval.embed", () => localVectorIds(chunks, embedder, query));
  }
}

async function vectorizeIds(
  vectorize: VectorSearch,
  embedder: Embedder,
  query: string,
  limit: number,
): Promise<string[]> {
  const vector = await embedder.embed(query);
  const result = await vectorize.query(vector, { topK: limit });
  return result.matches.map((match) => match.id);
}

async function localVectorIds(
  chunks: SearchableChunk[],
  embedder: Embedder,
  query: string,
): Promise<string[]> {
  const queryVector = await embedder.embed(query);
  const scored = await Promise.all(
    chunks.map(async (chunk) => ({
      id: chunk.id,
      score: cosineSimilarity(queryVector, await embedder.embed(chunk.text)),
    })),
  );
  return scored.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id)).map((entry) => entry.id);
}
