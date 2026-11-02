import type { Evidence, NormalizedFailureContext } from "@lockstep/shared";
import type { Env } from "./env.js";
import { createEnvEmbedder } from "./embeddings.js";
import type { ProviderEnvironment } from "./providerConfig.js";
import { reciprocalRankFusion } from "./hybridSearch.js";
import { investigationQueries } from "./investigationQueries.js";
import { investigationRunbooks } from "./investigationRunbooks.js";
import { searchRunbooks } from "./runbookIndex.js";

export interface InvestigationRetrieval {
  evidence: Evidence[];
  mode: "keyword" | "hybrid";
  warnings: Array<{ code: string; message: string }>;
}

export async function retrieveInvestigationEvidence(
  context: NormalizedFailureContext,
  env: Pick<Env, "VECTORIZE"> & ProviderEnvironment,
  signal?: AbortSignal,
  queryOverride?: string,
): Promise<InvestigationRetrieval> {
  const query = (queryOverride ?? investigationQueries(context)[0]?.text ?? context.kind).slice(
    0,
    1600,
  );
  const eligible = investigationRunbooks.filter((chunk) => chunk.kinds.includes(context.kind));
  const keywordIds = searchRunbooks(eligible, query, 6).map((chunk) => chunk.id);
  const warnings: InvestigationRetrieval["warnings"] = [];
  const signature = [
    context.metadata.networkError,
    context.metadata.status,
    context.metadata.sqlstate,
    context.metadata.errorType,
  ]
    .filter(Boolean)
    .join(" ");
  const signatureIds = signature
    ? searchRunbooks(eligible, signature, 6).map((chunk) => chunk.id)
    : [];
  // Exact diagnostic signatures outrank incidental request and category words.
  let ids = reciprocalRankFusion([signatureIds, signatureIds, keywordIds]);
  let mode: InvestigationRetrieval["mode"] = "keyword";
  if (env.VECTORIZE && env.OPENAI_API_KEY?.trim()) {
    try {
      signal?.throwIfAborted();
      const timedFetch: typeof fetch = (input, init) =>
        fetch(input, {
          ...init,
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
            : AbortSignal.timeout(8000),
        });
      const vector = await createEnvEmbedder(env, timedFetch).embed(query);
      const result = await boundedVectorQuery(env.VECTORIZE.query(vector, { topK: 8 }), signal);
      const eligibleIds = new Set(eligible.map((chunk) => chunk.id));
      const vectorIds = result.matches.map((match) => match.id).filter((id) => eligibleIds.has(id));
      ids = reciprocalRankFusion([signatureIds, signatureIds, keywordIds, vectorIds]);
      mode = "hybrid";
    } catch {
      signal?.throwIfAborted();
      warnings.push({
        code: "vector_unavailable",
        message: "Semantic retrieval was unavailable; the report uses local keyword retrieval.",
      });
    }
  } else {
    warnings.push({
      code: "keyword_retrieval",
      message:
        "Local keyword retrieval is active. This fallback does not provide semantic vector search.",
    });
  }
  const evidence = ids.slice(0, 4).flatMap((id): Evidence[] => {
    const chunk = eligible.find((candidate) => candidate.id === id);
    return chunk
      ? [
          {
            id: `runbook:${chunk.id}`,
            kind: "runbook",
            label: chunk.title,
            content: chunk.text,
            provenance: {
              sourceId: `builtin:${chunk.id}`,
              ...(chunk.url ? { url: chunk.url } : {}),
            },
          },
        ]
      : [];
  });
  if (!evidence.length)
    warnings.push({
      code: "no_retrieval_matches",
      message: "No relevant local runbook matched. Conclusions must rely on submitted evidence.",
    });
  return { evidence, mode, warnings };
}

async function boundedVectorQuery<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("vector_timeout"));
    }, 8000);
    const abort = () => {
      cleanup();
      reject(new Error("cancelled"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
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
