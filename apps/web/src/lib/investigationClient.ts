import {
  isInvestigationReport,
  type FailureKind,
  type InvestigationInput,
  type InvestigationReport,
  type WorkflowStage,
} from "@lockstep/shared";

const ACCESS_KEY_STORAGE = "lockstep.investigation.access.v1";
const ACCESS_KEY_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const STAGES = [
  "validating",
  "parsing",
  "retrieving",
  "investigating",
  "validating_evidence",
  "persisting",
  "complete",
  "cancelled",
  "failed",
] as const;
const KINDS = [
  "runtime_exception",
  "test_failure",
  "http_error",
  "application_log",
  "database_error",
  "sql_migration",
  "unknown",
] as const;

export interface ProgressEvent {
  stage: WorkflowStage;
  message: string;
  sessionId: string;
}
export interface InvestigationSummary {
  id: string;
  kind: FailureKind;
  summary: string;
  status: string;
  createdAt: string;
  mode: "ai" | "deterministic" | null;
}
export class InvestigationClientError extends Error {
  readonly code: string;
  constructor(message: string, code = "request_failed") {
    super(message);
    this.name = "InvestigationClientError";
    this.code = code;
  }
}

export function investigationApiUrl(): string {
  return (process.env.NEXT_PUBLIC_WORKER_URL ?? "http://localhost:8787").replace(/\/+$/, "");
}

export function getInvestigationAccessKey(): string {
  try {
    const existing = window.localStorage.getItem(ACCESS_KEY_STORAGE);
    if (existing && ACCESS_KEY_PATTERN.test(existing)) return existing;
    const bytes = window.crypto.getRandomValues(new Uint8Array(32));
    const key = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    window.localStorage.setItem(ACCESS_KEY_STORAGE, key);
    return key;
  } catch {
    throw new InvestigationClientError(
      "Private history needs browser storage. Allow local storage for this site, then try again.",
      "storage_unavailable",
    );
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function parseProgressEvent(value: unknown): ProgressEvent | null {
  if (
    !record(value) ||
    value.type !== "stage" ||
    typeof value.stage !== "string" ||
    !(STAGES as readonly string[]).includes(value.stage) ||
    typeof value.message !== "string" ||
    typeof value.sessionId !== "string"
  )
    return null;
  return {
    stage: value.stage as WorkflowStage,
    message: value.message.slice(0, 1000),
    sessionId: value.sessionId,
  };
}

export function readInvestigationSummaries(value: unknown): InvestigationSummary[] {
  if (!record(value) || !Array.isArray(value.investigations))
    throw new InvestigationClientError(
      "The server returned an invalid history response.",
      "invalid_response",
    );
  return value.investigations.map((item): InvestigationSummary => {
    if (
      !record(item) ||
      typeof item.id !== "string" ||
      typeof item.kind !== "string" ||
      !(KINDS as readonly string[]).includes(item.kind) ||
      typeof item.summary !== "string" ||
      typeof item.status !== "string" ||
      typeof item.createdAt !== "string" ||
      !Number.isFinite(Date.parse(item.createdAt)) ||
      (item.mode !== null && item.mode !== "ai" && item.mode !== "deterministic")
    )
      throw new InvestigationClientError(
        "The server returned an invalid history entry. Refresh to try again.",
        "invalid_response",
      );
    return {
      id: item.id,
      kind: item.kind as FailureKind,
      summary: item.summary,
      status: item.status,
      createdAt: item.createdAt,
      mode: item.mode,
    };
  });
}

export function parseEnvironment(text: string): Record<string, string> | undefined {
  if (!text.trim()) return undefined;
  const pairs = text.split(/\r?\n/).filter((line) => line.trim());
  const environment: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const line of pairs) {
    const split = line.indexOf("=");
    if (split < 1 || !line.slice(0, split).trim() || !line.slice(split + 1).trim())
      throw new InvestigationClientError(
        "Use one KEY=value pair per line for environment details.",
        "invalid_environment",
      );
    const key = line.slice(0, split).trim();
    if (key === "__proto__" || key === "constructor" || key === "prototype")
      throw new InvestigationClientError(
        "Use descriptive environment keys such as runtime or framework.",
        "invalid_environment",
      );
    environment[key] = line.slice(split + 1).trim();
  }
  return environment;
}

async function ownedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${getInvestigationAccessKey()}`);
  try {
    return await fetch(`${investigationApiUrl()}${path}`, { ...init, headers, cache: "no-store" });
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"))
      throw error;
    throw new InvestigationClientError(
      "Could not reach the investigation service. Check your connection and that the backend is running.",
      "network_error",
    );
  }
}

async function requireOk(response: Response): Promise<void> {
  if (response.ok) return;
  if (response.status === 401 || response.status === 403)
    throw new InvestigationClientError(
      "This browser does not have access to that investigation. Open it in the browser where it was created.",
      "access_denied",
    );
  if (response.status === 404)
    throw new InvestigationClientError(
      "This investigation is unavailable or has expired. Start a new investigation to continue.",
      "not_found",
    );
  const body: unknown = await response.json().catch(() => null);
  const message =
    record(body) && typeof body.error === "string"
      ? body.error.slice(0, 500)
      : `The investigation service could not complete the request (HTTP ${response.status}). Try again.`;
  throw new InvestigationClientError(
    message,
    record(body) && typeof body.code === "string" ? body.code : "request_failed",
  );
}

export async function fetchInvestigation(
  id: string,
  signal?: AbortSignal,
): Promise<InvestigationReport> {
  const response = await ownedFetch(`/api/investigations/${encodeURIComponent(id)}`, { signal });
  await requireOk(response);
  const value: unknown = await response.json().catch(() => null);
  if (!isInvestigationReport(value))
    throw new InvestigationClientError(
      "The saved investigation could not be read safely. Start a new investigation or try again.",
      "invalid_report",
    );
  return value;
}

export async function fetchInvestigationHistory(
  signal?: AbortSignal,
): Promise<InvestigationSummary[]> {
  const response = await ownedFetch("/api/investigations", { signal });
  await requireOk(response);
  return readInvestigationSummaries(await response.json().catch(() => null));
}

export async function deleteInvestigation(id: string, signal?: AbortSignal): Promise<void> {
  const response = await ownedFetch(`/api/investigations/${encodeURIComponent(id)}`, {
    method: "DELETE",
    signal,
  });
  await requireOk(response);
}

export async function readInvestigationStream(
  stream: ReadableStream<Uint8Array>,
  onProgress: (progress: ProgressEvent) => void,
): Promise<InvestigationReport> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let report: InvestigationReport | null = null;
  let done = false;
  const consume = (block: string) => {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) return;
    const value = parseJson(data);
    if (!record(value))
      throw new InvestigationClientError(
        "The service sent an unreadable progress event. Try the investigation again.",
        "invalid_stream",
      );
    const progress = parseProgressEvent(value);
    if (progress) {
      onProgress(progress);
      return;
    }
    if (value.type === "report") {
      if (!isInvestigationReport(value.report))
        throw new InvestigationClientError(
          "The investigation response did not match the report format. No unsafe output was displayed.",
          "invalid_report",
        );
      report = value.report;
    } else if (value.type === "error") {
      throw new InvestigationClientError(
        typeof value.error === "string"
          ? value.error.slice(0, 500)
          : "The investigation was interrupted. Try again.",
        typeof value.code === "string" ? value.code : "workflow_failed",
      );
    } else if (value.type === "done") {
      done = true;
    } else
      throw new InvestigationClientError(
        "The service sent an unsupported progress event. Refresh the app and try again.",
        "invalid_stream",
      );
  };
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 1_000_000)
        throw new InvestigationClientError(
          "The service response exceeded the safe display limit.",
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
    if (!report || !done)
      throw new InvestigationClientError(
        "The connection ended before the investigation completed. Check History for a saved result, or try again.",
        "interrupted",
      );
    return report;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function submitInvestigation(
  input: InvestigationInput,
  signal: AbortSignal,
  onProgress: (progress: ProgressEvent) => void,
): Promise<InvestigationReport> {
  const response = await ownedFetch("/api/investigations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(input),
    signal,
  });
  await requireOk(response);
  if (!response.body || !response.headers.get("Content-Type")?.includes("text/event-stream"))
    throw new InvestigationClientError(
      "The service did not open the investigation stream. Refresh and try again.",
      "invalid_stream",
    );
  return readInvestigationStream(response.body, onProgress);
}

export function investigationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError")
    return "The investigation took too long. Check History for a saved result, or try again with a shorter excerpt.";
  return error instanceof InvestigationClientError
    ? error.message
    : "The investigation could not finish. Try again, or check History for a saved result.";
}
