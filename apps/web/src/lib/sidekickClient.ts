import {
  isInvestigationReport,
  type FailureKind,
  type InvestigationReport,
  type WorkflowStage,
} from "@lockstep/shared";
import {
  getInvestigationAccessKey,
  investigationApiUrl,
  InvestigationClientError,
} from "./investigationClient";
import {
  isSidekickThread,
  isSidekickMessage,
  isSidekickEvent,
  isKnowledgeDocument,
  isKnowledgeSummary,
  isThreadSummary,
  type SidekickThread,
  type SidekickMessage,
  type ThreadSummary,
  type KnowledgeDocument,
  type KnowledgeSummary as KnowledgeDocumentSummary,
} from "@lockstep/shared";

export type {
  SidekickThread,
  SidekickMessage,
  ThreadSummary,
  KnowledgeDocument,
  KnowledgeDocumentSummary,
};
export interface SidekickProgress {
  stage: WorkflowStage;
  message: string;
}
export interface TurnInput {
  schemaVersion: 1;
  message: string;
  clientTurnId: string;
  requestedKind?: FailureKind;
  contextIds: string[];
  environment?: Record<string, string>;
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export async function sidekickRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await request(path, init);
  return response.json().catch(() => {
    throw new InvestigationClientError(
      "The service returned an unreadable response. Try refreshing.",
      "invalid_response",
    );
  });
}
async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${getInvestigationAccessKey()}`);
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`${investigationApiUrl()}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new InvestigationClientError(
      "The service is unreachable. Check your connection and try again. Your current draft is still here.",
      "network_error",
    );
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const fallback =
      response.status === 404
        ? "This thread or document is unavailable to this browser."
        : response.status === 409
          ? "This investigation already has a turn in progress. Refresh or stop it before trying again."
          : "The request could not finish. Please try again.";
    throw new InvestigationClientError(
      isRecord(body) && typeof body.error === "string" ? body.error.slice(0, 500) : fallback,
      isRecord(body) && typeof body.code === "string" ? body.code : "request_failed",
    );
  }
  return response;
}
function requireShape<T>(value: unknown, guard: (value: unknown) => value is T, label: string): T {
  if (!guard(value))
    throw new InvestigationClientError(
      `The service returned an invalid ${label}. Refresh to recover the saved version.`,
      "invalid_response",
    );
  return value;
}
export async function listThreads(signal?: AbortSignal): Promise<ThreadSummary[]> {
  const value = await sidekickRequest("/api/threads", { signal });
  if (!isRecord(value) || !Array.isArray(value.threads))
    throw new InvestigationClientError("Could not read investigation history.", "invalid_response");
  return value.threads.map((thread) => requireShape(thread, isThreadSummary, "thread summary"));
}
export async function createThread(signal?: AbortSignal): Promise<SidekickThread> {
  return requireShape(
    await sidekickRequest("/api/threads", { method: "POST", body: "{}", signal }),
    isSidekickThread,
    "thread",
  );
}
export async function getThread(id: string, signal?: AbortSignal): Promise<SidekickThread> {
  return requireShape(
    await sidekickRequest(`/api/threads/${encodeURIComponent(id)}`, { signal }),
    isSidekickThread,
    "thread",
  );
}
export async function deleteThread(id: string): Promise<void> {
  await sidekickRequest(`/api/threads/${encodeURIComponent(id)}`, { method: "DELETE" });
}
export async function cancelTurn(id: string, clientTurnId?: string): Promise<void> {
  await sidekickRequest(`/api/threads/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ clientTurnId }),
  });
}
export async function pinThreadContext(id: string, contextIds: string[]): Promise<void> {
  await sidekickRequest(`/api/threads/${encodeURIComponent(id)}/context`, {
    method: "PATCH",
    body: JSON.stringify({ schemaVersion: 1, contextIds }),
  });
}
export async function listKnowledge(signal?: AbortSignal): Promise<KnowledgeDocumentSummary[]> {
  const value = await sidekickRequest("/api/knowledge", { signal });
  if (!isRecord(value) || !Array.isArray(value.documents))
    throw new InvestigationClientError(
      "Could not read your knowledge library.",
      "invalid_response",
    );
  return value.documents.map((item) => requireShape(item, isKnowledgeSummary, "document summary"));
}
export async function getKnowledge(id: string): Promise<KnowledgeDocument> {
  return requireShape(
    await sidekickRequest(`/api/knowledge/${encodeURIComponent(id)}`),
    isKnowledgeDocument,
    "document",
  );
}
export async function addKnowledge(value: {
  title: string;
  content: string;
  kind: "document" | "code" | "log" | "note";
}): Promise<KnowledgeDocumentSummary> {
  return requireShape(
    await sidekickRequest("/api/knowledge", {
      method: "POST",
      body: JSON.stringify({ schemaVersion: 1, ...value }),
    }),
    isKnowledgeSummary,
    "document summary",
  );
}
export async function deleteKnowledge(id: string): Promise<void> {
  await sidekickRequest(`/api/knowledge/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export interface TurnHandlers {
  onProgress: (progress: SidekickProgress) => void;
  onDelta: (content: string) => void;
  onMessage: (message: SidekickMessage) => void;
}
export async function readTurnStream(
  stream: ReadableStream<Uint8Array>,
  handlers: TurnHandlers,
  expectedThreadId?: string,
): Promise<SidekickMessage> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalMessage: SidekickMessage | null = null;
  let done = false;
  let totalDelta = 0;
  const consume = (block: string) => {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) return;
    const event = parseJson(data);
    if (!isSidekickEvent(event))
      throw new InvestigationClientError(
        "The response stream was unreadable. Refresh to recover any saved result.",
        "invalid_stream",
      );
    if ("threadId" in event && expectedThreadId && event.threadId !== expectedThreadId)
      throw new InvestigationClientError(
        "The response belonged to a different thread. Refresh to recover safely.",
        "invalid_stream",
      );
    if (
      event.type === "stage" &&
      typeof event.message === "string" &&
      typeof event.stage === "string"
    )
      handlers.onProgress({ stage: event.stage, message: event.message.slice(0, 1000) });
    else if (
      event.type === "delta" &&
      event.provisional === true &&
      typeof event.content === "string"
    ) {
      totalDelta += event.content.length;
      if (totalDelta > 96_000)
        throw new InvestigationClientError(
          "The streamed answer exceeded its display limit.",
          "response_too_large",
        );
      handlers.onDelta(event.content);
    } else if (event.type === "message") {
      finalMessage = requireShape(event.message, isSidekickMessage, "assistant message");
      if (
        finalMessage.role !== "assistant" ||
        (expectedThreadId && finalMessage.threadId !== expectedThreadId)
      )
        throw new InvestigationClientError(
          "The final response did not match this investigation.",
          "invalid_stream",
        );
      handlers.onMessage(finalMessage);
    } else if (event.type === "done") done = true;
    else if (event.type === "error")
      throw new InvestigationClientError(
        typeof event.error === "string"
          ? event.error.slice(0, 500)
          : "The turn was interrupted. Refresh to recover the saved result.",
        typeof event.code === "string" ? event.code : "turn_failed",
      );
    else if (event.type !== "thread")
      throw new InvestigationClientError(
        "The service sent an unsupported stream event. Refresh the app and try again.",
        "invalid_stream",
      );
  };
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 1_000_000)
        throw new InvestigationClientError(
          "The service response was too large.",
          "response_too_large",
        );
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      for (const block of blocks) consume(block);
      if (chunk.done) {
        if (buffer.trim()) consume(buffer);
        break;
      }
    }
    if (!done || !finalMessage)
      throw new InvestigationClientError(
        "The connection ended before the final answer arrived. Refresh this thread to recover any saved result.",
        "interrupted",
      );
    return finalMessage;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
export async function sendTurn(
  threadId: string,
  input: TurnInput,
  signal: AbortSignal,
  handlers: TurnHandlers,
): Promise<SidekickMessage> {
  const response = await request(`/api/threads/${encodeURIComponent(threadId)}/messages`, {
    method: "POST",
    headers: { Accept: "text/event-stream" },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream"))
    throw new InvestigationClientError(
      "The investigation stream did not open. Refresh and try again.",
      "invalid_stream",
    );
  return readTurnStream(response.body, handlers, threadId);
}
export async function readContextFile(file: File): Promise<string> {
  if (
    !/\.(txt|md|log|json|sql|py|js|ts|tsx|jsx|rs|java|ya?ml|toml|csv|go|rb|sh|css|html|xml)$/i.test(
      file.name,
    )
  )
    throw new InvestigationClientError(
      "Choose a UTF-8 text, code, or log file. Binary files are not supported.",
      "invalid_file",
    );
  if (file.size > 32_768)
    throw new InvestigationClientError(
      "Context files must be at most 32 KB. Choose a focused excerpt.",
      "file_too_large",
    );
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    if (text.includes("\0") || !text.trim()) throw new Error("invalid text");
    return text;
  } catch {
    throw new InvestigationClientError(
      "This file is empty or is not valid UTF-8 text.",
      "invalid_file",
    );
  }
}
export function latestReport(thread: SidekickThread | null): InvestigationReport | null {
  const message = thread?.messages
    .slice()
    .reverse()
    .find((item) => item.role === "assistant" && item.report);
  return message?.report && isInvestigationReport(message.report) ? message.report : null;
}
