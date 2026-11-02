import { KNOWLEDGE_LIMITS, type Evidence } from "@lockstep/shared";
import type { Env } from "./env.js";
import { createEnvEmbedder } from "./embeddings.js";
import { reciprocalRankFusion } from "./hybridSearch.js";
import { indexTokens } from "./runbookIndex.js";
import { KnowledgeRepository, type KnowledgeChunk } from "./knowledgeRepository.js";

export interface KnowledgeSearchOptions {
  env?: Pick<Env, "OPENAI_API_KEY" | "VECTORIZE">;
  signal?: AbortSignal;
}
export function knowledgeEvidence(
  chunk: KnowledgeChunk,
  maxCharacters: number = KNOWLEDGE_LIMITS.chunkCharacters,
): Evidence {
  let end = Math.min(chunk.content.length, maxCharacters);
  const last = chunk.content.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  const content = chunk.content.slice(0, end);
  const breaks = content.match(/\r\n|\n|\r/g)?.length ?? 0;
  return {
    id: `context:${chunk.documentId}:${chunk.ordinal}`,
    kind: "context",
    label: `${chunk.title}, lines ${chunk.lineStart}-${chunk.lineStart + breaks - (/[\r\n]$/.test(content) ? 1 : 0)}`,
    content,
    provenance: {
      sourceId: `knowledge:${chunk.documentId}`,
      lineStart: chunk.lineStart,
      lineEnd: chunk.lineStart + breaks - (/[\r\n]$/.test(content) ? 1 : 0),
    },
  };
}
export async function readKnowledgeContext(
  db: D1Database,
  owner: string,
  ids: string[],
): Promise<Evidence[]> {
  if (!ids.length) return [];
  const chunks = await new KnowledgeRepository(db).chunks(owner, ids);
  const first = ids.slice(0, 12).flatMap((id) => {
    const chunk = chunks.find((item) => item.documentId === id);
    return chunk ? [knowledgeEvidence(chunk, 1_200)] : [];
  });
  return first;
}
export async function searchKnowledge(
  db: D1Database,
  owner: string,
  query: string,
  contextIds?: string[],
  options: KnowledgeSearchOptions = {},
): Promise<Evidence[]> {
  options.signal?.throwIfAborted();
  const chunks = await new KnowledgeRepository(db).chunks(owner, contextIds);
  if (!chunks.length) return [];
  const tokens = [...new Set(indexTokens(query))].slice(0, 64);
  const ranked = chunks
    .map((chunk) => {
      const body = new Set(indexTokens(chunk.content));
      const title = new Set(indexTokens(chunk.title));
      const score = tokens.reduce(
        (sum, token) => sum + (body.has(token) ? 1 : 0) + (title.has(token) ? 2 : 0),
        0,
      );
      return { chunk, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.chunk.id.localeCompare(right.chunk.id));
  const keyword = ranked.map((item) => item.chunk.id);
  let ids = keyword;
  const env = options.env;
  if (env?.VECTORIZE && env.OPENAI_API_KEY?.trim() && query.trim()) {
    try {
      const vector = await createEnvEmbedder(env).embed(query.slice(0, 1_200));
      const result = await knowledgeTimeout(
        env.VECTORIZE.query(vector, { topK: 12, namespace: owner, filter: { owner } }),
        options.signal,
      );
      const owned = new Set(chunks.map((chunk) => chunk.id));
      const semantic = result.matches.map((match) => match.id).filter((id) => owned.has(id));
      ids = reciprocalRankFusion([keyword, semantic]);
    } catch {
      options.signal?.throwIfAborted();
    }
  }
  if (!ids.length && contextIds?.length)
    ids = contextIds.flatMap((id) => {
      const first = chunks.find((chunk) => chunk.documentId === id);
      return first ? [first.id] : [];
    });
  let remaining = KNOWLEDGE_LIMITS.retrievedCharacters;
  return ids.slice(0, KNOWLEDGE_LIMITS.retrievedChunks).flatMap((id): Evidence[] => {
    const chunk = chunks.find((item) => item.id === id);
    if (!chunk || remaining <= 0) return [];
    const evidence = knowledgeEvidence(
      chunk,
      Math.min(KNOWLEDGE_LIMITS.chunkCharacters, remaining),
    );
    remaining -= evidence.content.length;
    return [evidence];
  });
}
export function knowledgeTimeout<T>(
  operation: Promise<T>,
  signal?: AbortSignal,
  milliseconds = 8_000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new Error("Knowledge operation interrupted"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Knowledge service unavailable"));
    }, milliseconds);
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}
