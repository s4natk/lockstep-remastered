import type { Citation, ParseResult } from "@lockstep/shared";

import type { TraceSpan } from "./protocol";

export type ReviewStatus =
  | "connecting"
  | "parsing"
  | "retrieving"
  | "drafting"
  | "completed"
  | "failed"
  | "stopped";

/** A context note as it was sent; its position is the `context-N` source id. */
export interface ContextRef {
  id?: string;
  title?: string;
  text: string;
}

export interface ReviewProgress {
  connected: boolean;
  parsed: boolean;
  retrieving: boolean;
  drafting: boolean;
}

export interface ReviewRecord {
  /** Worker session id; also the D1 row id. */
  id: string;
  /** The exact SQL sent to the Worker. Parser offsets are relative to it. */
  sql: string;
  createdAt: number;
  finishedAt?: number;
  status: ReviewStatus;
  origin: "live" | "history" | "worker";
  progress: ReviewProgress;
  parse?: ParseResult;
  /** Streamed draft before the citation check. */
  draft?: string;
  /** Citation-checked note from the Worker's `done` event. */
  note?: string;
  citations?: Citation[];
  /** Sentences removed by the citation check; `null` when the Worker did not store them. */
  dropped?: string[] | null;
  trace?: TraceSpan[];
  /** Context sent with the review; `null` when unknown. */
  context?: ContextRef[] | null;
  /** Whether the Worker had an OpenAI key when this review started, if known. */
  drafter?: "live" | "mock";
  /** Set when an older Worker answered the SQL as a chat question instead of reviewing it. */
  reply?: string;
  error?: string;
  /** Where a failure came from: an `error` event, the socket, or a chat answer. */
  failure?: "worker" | "connection" | "answered-as-chat";
}

export const ACTIVE_STATUSES: ReadonlySet<ReviewStatus> = new Set([
  "connecting",
  "parsing",
  "retrieving",
  "drafting",
]);

export function isActive(record: ReviewRecord | null | undefined): boolean {
  return record !== null && record !== undefined && ACTIVE_STATUSES.has(record.status);
}

export function emptyProgress(): ReviewProgress {
  return { connected: false, parsed: false, retrieving: false, drafting: false };
}

export function completedProgress(): ReviewProgress {
  return { connected: true, parsed: true, retrieving: true, drafting: true };
}

/** A short single-line title for a migration, taken from its first statement. */
export function reviewTitle(record: Pick<ReviewRecord, "sql" | "parse">): string {
  const first = record.parse?.statements[0]?.sql ?? firstCodeLine(record.sql);
  const flat = first.replace(/\s+/g, " ").trim();
  const title = flat.length > 56 ? `${flat.slice(0, 55).trimEnd()}…` : flat;
  return title === "" ? "Untitled migration" : title;
}

export function extraStatementCount(record: Pick<ReviewRecord, "parse">): number {
  return Math.max(0, (record.parse?.statements.length ?? 0) - 1);
}

function firstCodeLine(sql: string): string {
  for (const line of sql.split("\n")) {
    const trimmed = line.trim();
    if (trimmed !== "" && !trimmed.startsWith("--")) {
      return trimmed;
    }
  }
  return sql.trim();
}
