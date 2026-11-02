import type { Env } from "./env.js";
import { createEnvEmbedder } from "./embeddings.js";
import { KnowledgeRepository } from "./knowledgeRepository.js";
import { knowledgeTimeout } from "./knowledgeSearch.js";

export async function indexKnowledge(
  db: D1Database,
  owner: string,
  documentId: string,
  env: Pick<Env, "OPENAI_API_KEY" | "VECTORIZE">,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!env.VECTORIZE || !env.OPENAI_API_KEY?.trim()) return false;
  try {
    const chunks = await new KnowledgeRepository(db).chunks(owner, [documentId]);
    if (!chunks.length) return false;
    const embedder = createEnvEmbedder(env);
    const vectors = await knowledgeTimeout(
      Promise.all(
        chunks.map(async (chunk) => ({
          id: chunk.id,
          namespace: owner,
          values: await embedder.embed(chunk.content),
          metadata: { owner, documentId },
        })),
      ),
      signal,
      10_000,
    );
    signal?.throwIfAborted();
    await knowledgeTimeout(env.VECTORIZE.upsert(vectors), signal);
    await new KnowledgeRepository(db).markSemantic(owner, documentId);
    return true;
  } catch {
    signal?.throwIfAborted();
    return false;
  }
}
export async function removeKnowledgeVectors(
  ids: string[],
  env: Pick<Env, "VECTORIZE">,
): Promise<void> {
  if (!env.VECTORIZE || !ids.length) return;
  try {
    await knowledgeTimeout(env.VECTORIZE.deleteByIds(ids));
  } catch {
    /* D1 ownership and existence remain authoritative during retrieval. */
  }
}
