import type { FailureKind, InvestigationReport, InvestigationProgress } from "./investigation.js";
import { isInvestigationReport } from "./reportValidation.js";
import {
  INPUT_LIMITS,
  InvestigationValidationError,
  isFailureKind,
  isRecord,
  utf8ByteLength,
  validateInvestigationInput,
} from "./validation.js";

export const SIDEKICK_LIMITS = {
  contextIds: 12,
  messages: 200,
  message: INPUT_LIMITS.rawInput,
  payloadBytes: INPUT_LIMITS.payloadBytes,
} as const;
export const KNOWLEDGE_LIMITS = {
  documents: 50,
  title: 160,
  content: 32_768,
  payloadBytes: 65_536,
  chunks: 24,
  chunkCharacters: 2_400,
  retrievedChunks: 8,
  retrievedCharacters: 16_000,
} as const;
export const KNOWLEDGE_KINDS = ["document", "code", "log", "note"] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export interface SidekickTurnInput {
  schemaVersion: 1;
  message: string;
  clientTurnId: string;
  requestedKind?: FailureKind;
  contextIds?: string[];
  environment?: Record<string, string>;
}
export interface ThreadSummary {
  id: string;
  title: string;
  kind: FailureKind;
  createdAt: string;
  updatedAt: string;
  status: "idle" | "running";
  lastPreview: string;
}
export interface SidekickMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  status: "complete" | "cancelled" | "failed";
  report?: InvestigationReport;
  mode?: "ai" | "deterministic";
  clientTurnId: string;
  contextIds?: string[];
}
export interface SidekickThread extends ThreadSummary {
  messages: SidekickMessage[];
  contextIds: string[];
}
export interface KnowledgeInput {
  schemaVersion: 1;
  title: string;
  content: string;
  kind: KnowledgeKind;
}
export interface KnowledgeSummary {
  id: string;
  title: string;
  kind: KnowledgeKind;
  createdAt: string;
  updatedAt: string;
  charCount: number;
  chunkCount: number;
  indexStatus: "keyword" | "semantic";
}
export interface KnowledgeDocument extends KnowledgeSummary {
  content: string;
}
export type SidekickEvent =
  | { type: "thread"; thread: ThreadSummary }
  | ({ type: "stage"; threadId: string; turnId: string } & InvestigationProgress)
  | { type: "delta"; threadId: string; turnId: string; content: string; provisional: true }
  | { type: "message"; message: SidekickMessage }
  | { type: "done"; threadId: string; turnId: string }
  | { type: "error"; error: string; code: string; threadId?: string; turnId?: string };

function text(value: unknown, limit: number, allowEmpty = false): value is string {
  return (
    typeof value === "string" && value.length <= limit && (allowEmpty || value.trim().length > 0)
  );
}
function id(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
function date(value: unknown): value is string {
  return text(value, 64) && Number.isFinite(Date.parse(value));
}
function contextIds(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= SIDEKICK_LIMITS.contextIds &&
    value.every(id) &&
    new Set(value).size === value.length
  );
}
function knowledgeKind(value: unknown): value is KnowledgeKind {
  return typeof value === "string" && KNOWLEDGE_KINDS.some((kind) => kind === value);
}

export function validateSidekickTurnInput(value: unknown): SidekickTurnInput {
  if (!isRecord(value) || value.schemaVersion !== 1 || !id(value.clientTurnId))
    throw new InvestigationValidationError("Use schemaVersion 1 and a valid unique clientTurnId.");
  if (value.contextIds !== undefined && !contextIds(value.contextIds))
    throw new InvestigationValidationError(
      `Select at most ${SIDEKICK_LIMITS.contextIds} distinct context documents.`,
    );
  const normalized = validateInvestigationInput({
    schemaVersion: 1,
    rawInput: value.message,
    requestedKind: value.requestedKind,
    environment: value.environment,
  });
  const result: SidekickTurnInput = {
    schemaVersion: 1,
    message: normalized.rawInput,
    clientTurnId: value.clientTurnId,
    ...(normalized.requestedKind ? { requestedKind: normalized.requestedKind } : {}),
    ...(normalized.environment ? { environment: normalized.environment } : {}),
    ...(value.contextIds ? { contextIds: [...value.contextIds] } : {}),
  };
  if (utf8ByteLength(JSON.stringify(result)) > SIDEKICK_LIMITS.payloadBytes)
    throw new InvestigationValidationError(
      "The message and context metadata exceed the payload size limit.",
    );
  return result;
}
export function validateKnowledgeInput(value: unknown): KnowledgeInput {
  if (!isRecord(value) || value.schemaVersion !== 1 || !knowledgeKind(value.kind))
    throw new InvestigationValidationError(
      "Choose document, code, log, or note with schemaVersion 1.",
    );
  if (!text(value.title, KNOWLEDGE_LIMITS.title))
    throw new InvestigationValidationError(
      `Give the context a title of at most ${KNOWLEDGE_LIMITS.title} characters.`,
    );
  if (!text(value.content, KNOWLEDGE_LIMITS.content) || value.content.includes("\0"))
    throw new InvestigationValidationError(
      `Paste nonempty context of at most ${KNOWLEDGE_LIMITS.content} characters without null bytes.`,
    );
  const result: KnowledgeInput = {
    schemaVersion: 1,
    title: value.title.trim(),
    content: value.content,
    kind: value.kind,
  };
  if (utf8ByteLength(JSON.stringify(result)) > KNOWLEDGE_LIMITS.payloadBytes)
    throw new InvestigationValidationError(
      "The context exceeds the 65536-byte UTF-8 payload limit.",
    );
  return result;
}
export function isThreadSummary(value: unknown): value is ThreadSummary {
  return (
    isRecord(value) &&
    id(value.id) &&
    text(value.title, 200) &&
    isFailureKind(value.kind) &&
    date(value.createdAt) &&
    date(value.updatedAt) &&
    (value.status === "idle" || value.status === "running") &&
    text(value.lastPreview, 2_000, true)
  );
}
export function isSidekickMessage(value: unknown): value is SidekickMessage {
  return (
    isRecord(value) &&
    id(value.id) &&
    id(value.threadId) &&
    (value.role === "user" || value.role === "assistant") &&
    text(value.content, SIDEKICK_LIMITS.message, true) &&
    date(value.createdAt) &&
    ["complete", "cancelled", "failed"].some((status) => status === value.status) &&
    id(value.clientTurnId) &&
    (value.contextIds === undefined || contextIds(value.contextIds)) &&
    (value.mode === undefined || value.mode === "ai" || value.mode === "deterministic") &&
    (value.report === undefined || isInvestigationReport(value.report))
  );
}
export function isSidekickThread(value: unknown): value is SidekickThread {
  return (
    isThreadSummary(value) &&
    isRecord(value) &&
    contextIds(value.contextIds) &&
    Array.isArray(value.messages) &&
    value.messages.length <= SIDEKICK_LIMITS.messages &&
    value.messages.every(
      (message: unknown) => isSidekickMessage(message) && message.threadId === value.id,
    ) &&
    new Set(value.messages.map((message) => message.id)).size === value.messages.length
  );
}
export function isKnowledgeSummary(value: unknown): value is KnowledgeSummary {
  return (
    isRecord(value) &&
    id(value.id) &&
    text(value.title, KNOWLEDGE_LIMITS.title) &&
    knowledgeKind(value.kind) &&
    date(value.createdAt) &&
    date(value.updatedAt) &&
    typeof value.charCount === "number" &&
    Number.isInteger(value.charCount) &&
    value.charCount > 0 &&
    value.charCount <= KNOWLEDGE_LIMITS.content &&
    typeof value.chunkCount === "number" &&
    Number.isInteger(value.chunkCount) &&
    value.chunkCount > 0 &&
    value.chunkCount <= KNOWLEDGE_LIMITS.chunks &&
    (value.indexStatus === "keyword" || value.indexStatus === "semantic")
  );
}
export function isKnowledgeDocument(value: unknown): value is KnowledgeDocument {
  return (
    isKnowledgeSummary(value) &&
    isRecord(value) &&
    text(value.content, KNOWLEDGE_LIMITS.content) &&
    value.content.length === value.charCount
  );
}
export function isSidekickEvent(value: unknown): value is SidekickEvent {
  if (!isRecord(value)) return false;
  if (value.type === "thread") return isThreadSummary(value.thread);
  if (value.type === "message") return isSidekickMessage(value.message);
  if (value.type === "error")
    return (
      text(value.error, 2_000) &&
      text(value.code, 128) &&
      (value.threadId === undefined || id(value.threadId)) &&
      (value.turnId === undefined || id(value.turnId))
    );
  if (!id(value.threadId) || !id(value.turnId)) return false;
  if (value.type === "done") return true;
  if (value.type === "delta")
    return value.provisional === true && text(value.content, 16_384, true);
  if (value.type === "stage")
    return (
      value.schemaVersion === 1 &&
      id(value.sessionId) &&
      date(value.timestamp) &&
      [
        "validating",
        "parsing",
        "retrieving",
        "investigating",
        "validating_evidence",
        "persisting",
        "complete",
        "cancelled",
        "failed",
      ].some((stage) => stage === value.stage) &&
      text(value.message, 2_000)
    );
  return false;
}
