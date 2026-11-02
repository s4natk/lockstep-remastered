import type { Citation, CitationKind, Hazard, HazardCode, ParseResult, ParsedStatement } from "@lockstep/shared";

import { isRecord } from "./storage";

export interface TraceSpan {
  name: string;
  durationMs: number;
}

export type ReviewStage = "retrieve" | "draft";

export type ServerEvent =
  | { type: "intent"; intent: "chat" | "review" }
  | { type: "stage"; stage: ReviewStage }
  | { type: "parse"; result: ParseResult }
  | { type: "token"; content: string }
  | {
      type: "review-done";
      note: string;
      citations: Citation[];
      dropped: string[];
      trace: TraceSpan[];
    }
  | { type: "chat-done"; reply: string }
  | { type: "error"; error: string };

export type ClientMessage =
  | { type: "review"; sql: string; context: string[] }
  | { type: "message"; text: string; context: string[] };

const HAZARD_CODES: readonly HazardCode[] = ["safe", "lock_risk", "data_loss", "rewrite"];
const CITATION_KINDS: readonly CitationKind[] = ["parser", "runbook", "context"];

export function parseServerEvent(raw: string): ServerEvent | null {
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(message) || typeof message.type !== "string") {
    return null;
  }
  switch (message.type) {
    case "intent":
      return message.intent === "chat" || message.intent === "review"
        ? { type: "intent", intent: message.intent }
        : null;
    case "stage":
      return message.stage === "retrieve" || message.stage === "draft"
        ? { type: "stage", stage: message.stage }
        : null;
    case "parse": {
      const result = readParseResult(message.result);
      return result === null ? null : { type: "parse", result };
    }
    case "token":
      return typeof message.content === "string" ? { type: "token", content: message.content } : null;
    case "done":
      if (typeof message.note === "string") {
        return {
          type: "review-done",
          note: message.note,
          citations: readCitations(message.citations),
          dropped: readStrings(message.dropped),
          trace: readTrace(message.trace),
        };
      }
      if (typeof message.reply === "string") {
        return { type: "chat-done", reply: message.reply };
      }
      return null;
    case "error":
      return typeof message.error === "string" ? { type: "error", error: message.error } : null;
    default:
      return null;
  }
}

export function readParseResult(value: unknown): ParseResult | null {
  if (!isRecord(value) || !Array.isArray(value.statements) || !Array.isArray(value.hazards)) {
    return null;
  }
  const statements = value.statements.flatMap((item): ParsedStatement[] => {
    if (
      !isRecord(item) ||
      typeof item.index !== "number" ||
      typeof item.sql !== "string" ||
      typeof item.start !== "number" ||
      typeof item.end !== "number"
    ) {
      return [];
    }
    return [{ index: item.index, sql: item.sql, start: item.start, end: item.end }];
  });
  const hazards = value.hazards.flatMap((item): Hazard[] => {
    if (
      !isRecord(item) ||
      typeof item.code !== "string" ||
      !HAZARD_CODES.includes(item.code as HazardCode) ||
      typeof item.statementIndex !== "number" ||
      typeof item.start !== "number" ||
      typeof item.end !== "number" ||
      typeof item.sql !== "string" ||
      typeof item.reason !== "string"
    ) {
      return [];
    }
    return [
      {
        code: item.code as HazardCode,
        statementIndex: item.statementIndex,
        start: item.start,
        end: item.end,
        sql: item.sql,
        reason: item.reason,
      },
    ];
  });
  return { statements, hazards };
}

export function readCitations(value: unknown): Citation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): Citation[] => {
    if (
      !isRecord(item) ||
      typeof item.kind !== "string" ||
      !CITATION_KINDS.includes(item.kind as CitationKind) ||
      typeof item.quote !== "string" ||
      typeof item.sourceId !== "string"
    ) {
      return [];
    }
    return [{ kind: item.kind as CitationKind, quote: item.quote, sourceId: item.sourceId }];
  });
}

export function readTrace(value: unknown): TraceSpan[] {
  const spans = isRecord(value) ? value.spans : value;
  if (!Array.isArray(spans)) {
    return [];
  }
  return spans.flatMap((span): TraceSpan[] => {
    if (!isRecord(span) || typeof span.name !== "string" || typeof span.durationMs !== "number") {
      return [];
    }
    return [{ name: span.name, durationMs: span.durationMs }];
  });
}

export function readStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}
