import type { TraceSpan } from "./protocol";

const LABELS: Record<string, { label: string; depth: number }> = {
  "wasm.parse": { label: "Parse", depth: 0 },
  "retrieval.hybrid": { label: "Hybrid retrieval", depth: 0 },
  "retrieval.embed": { label: "Embeddings", depth: 1 },
  "retrieval.vectorize": { label: "Vectorize query", depth: 1 },
  "review.draft": { label: "Draft", depth: 0 },
};

const ORDER = ["wasm.parse", "retrieval.hybrid", "retrieval.vectorize", "retrieval.embed", "review.draft"];

export interface TraceRow extends TraceSpan {
  label: string;
  depth: number;
}

/** Spans in pipeline order; retrieval sub-spans sit under hybrid retrieval. */
export function traceRows(spans: TraceSpan[]): TraceRow[] {
  return [...spans]
    .map((span) => ({ ...span, ...(LABELS[span.name] ?? { label: span.name, depth: 0 }) }))
    .sort((left, right) => rank(left.name) - rank(right.name));
}

function rank(name: string): number {
  const at = ORDER.indexOf(name);
  return at === -1 ? ORDER.length : at;
}

export function spanDuration(spans: TraceSpan[] | undefined, name: string): number | undefined {
  return spans?.find((span) => span.name === name)?.durationMs;
}
