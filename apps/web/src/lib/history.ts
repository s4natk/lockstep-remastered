import { readCitations, readParseResult, readStrings, readTrace } from "./protocol";
import { completedProgress, type ContextRef, type ReviewRecord } from "./review";
import { isRecord, readJson, STORAGE_KEYS, writeJson } from "./storage";

export const HISTORY_LIMIT = 30;

/** Completed reviews kept in this browser, newest first. */
export function loadHistory(): ReviewRecord[] {
  const raw = readJson<unknown>(STORAGE_KEYS.history, []);
  return Array.isArray(raw) ? raw.flatMap((item) => sanitizeRecord(item) ?? []) : [];
}

export function saveHistory(records: ReviewRecord[]): void {
  writeJson(
    STORAGE_KEYS.history,
    records.slice(0, HISTORY_LIMIT).map((record) => ({ ...record, draft: undefined, origin: "history" })),
  );
}

export function upsertHistory(records: ReviewRecord[], record: ReviewRecord): ReviewRecord[] {
  const stored: ReviewRecord = { ...record, draft: undefined, origin: "history" };
  return [stored, ...records.filter((item) => item.id !== record.id)].slice(0, HISTORY_LIMIT);
}

export function sanitizeRecord(value: unknown): ReviewRecord | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.sql !== "string" ||
    typeof value.createdAt !== "number" ||
    value.status !== "completed"
  ) {
    return null;
  }
  const parse = readParseResult(value.parse);
  return {
    id: value.id,
    sql: value.sql,
    createdAt: value.createdAt,
    finishedAt: typeof value.finishedAt === "number" ? value.finishedAt : undefined,
    status: "completed",
    origin: "history",
    progress: completedProgress(),
    parse: parse ?? undefined,
    note: typeof value.note === "string" ? value.note : undefined,
    citations: readCitations(value.citations),
    dropped: value.dropped === null ? null : readStrings(value.dropped),
    trace: readTrace(value.trace),
    context: value.context === null ? null : readContext(value.context),
    drafter: value.drafter === "live" || value.drafter === "mock" ? value.drafter : undefined,
  };
}

function readContext(value: unknown): ContextRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): ContextRef[] => {
    if (!isRecord(item) || typeof item.text !== "string") {
      return [];
    }
    return [
      {
        id: typeof item.id === "string" ? item.id : undefined,
        title: typeof item.title === "string" ? item.title : undefined,
        text: item.text,
      },
    ];
  });
}
