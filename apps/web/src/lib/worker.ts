import { readCitations, readParseResult, readTrace } from "./protocol";
import { completedProgress, type ReviewRecord } from "./review";
import { isRecord } from "./storage";

const DEFAULT_WORKER_URL = "http://localhost:8787";

export function workerHttpUrl(): string {
  return (process.env.NEXT_PUBLIC_WORKER_URL ?? DEFAULT_WORKER_URL).replace(/\/+$/, "");
}

export function reviewSocketUrl(sessionId: string): string {
  const url = new URL(workerHttpUrl());
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `/agent/connect/${encodeURIComponent(sessionId)}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export interface WorkerHealth {
  ok: boolean;
  checkedAt: number;
  openai?: {
    configured: boolean;
    chatModel: string;
    mode: "live" | "mock";
  };
}

export async function fetchWorkerHealth(timeoutMs = 6000): Promise<WorkerHealth | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${workerHttpUrl()}/health`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const body: unknown = await response.json();
    if (!isRecord(body) || body.ok !== true) {
      return null;
    }
    const openai = isRecord(body.openai) ? body.openai : null;
    return {
      ok: true,
      checkedAt: Date.now(),
      openai:
        openai && typeof openai.configured === "boolean"
          ? {
              configured: openai.configured,
              chatModel: typeof openai.chatModel === "string" ? openai.chatModel : "unknown",
              mode: openai.mode === "live" ? "live" : "mock",
            }
          : undefined,
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export type StoredReviewResult =
  | { ok: true; record: ReviewRecord }
  | { ok: false; reason: "not-found" | "incomplete" | "unreachable" };

/** Loads a review the Worker saved in D1 (`GET /api/sessions/:id`). */
export async function fetchStoredReview(id: string): Promise<StoredReviewResult> {
  let response: Response;
  try {
    response = await fetch(`${workerHttpUrl()}/api/sessions/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  if (response.status === 404) {
    return { ok: false, reason: "not-found" };
  }
  if (!response.ok) {
    return { ok: false, reason: "unreachable" };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!isRecord(body) || typeof body.sql !== "string" || typeof body.note !== "string") {
    return { ok: false, reason: "incomplete" };
  }
  const parse = readParseResult(safeJson(body.parseJson));
  const createdAt = typeof body.createdAt === "string" ? Date.parse(body.createdAt) : Number.NaN;
  return {
    ok: true,
    record: {
      id: typeof body.id === "string" ? body.id : id,
      sql: body.sql,
      createdAt: Number.isNaN(createdAt) ? Date.now() : createdAt,
      status: "completed",
      origin: "worker",
      progress: completedProgress(),
      parse: parse ?? undefined,
      note: body.note,
      citations: readCitations(safeJson(body.citationsJson)),
      dropped: null,
      trace: readTrace(safeJson(body.traceJson)),
      context: null,
    },
  };
}

function safeJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
