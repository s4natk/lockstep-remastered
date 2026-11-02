import type { Evidence } from "./investigation.js";
import { addFinding, emptyDetails, plainText } from "./parsing.js";
import type { ParsedFailureDetails } from "./parsing.js";
import { isRecord } from "./validation.js";

function extractJsonFields(value: unknown, result: ParsedFailureDetails, evidenceId: string): void {
  if (!isRecord(value)) return;
  const status = value.status ?? value.statusCode ?? value.status_code;
  if (
    (typeof status === "number" || typeof status === "string") &&
    /^[45]\d\d$/.test(String(status))
  ) {
    result.metadata.status = String(status);
    addFinding(result, "http.status", `The response reports HTTP ${status}.`, [evidenceId]);
  }
  for (const key of ["message", "error", "detail"]) {
    const entry = value[key];
    if (typeof entry === "string" && entry.trim()) {
      result.errorMessages.push(entry);
      addFinding(result, "http.message", entry, [evidenceId]);
    } else if (isRecord(entry) && typeof entry.message === "string") {
      result.errorMessages.push(entry.message);
      addFinding(result, "http.message", entry.message, [evidenceId]);
    }
  }
  for (const key of ["method", "url", "requestId", "request_id", "retryAfter"]) {
    if (typeof value[key] === "string") result.metadata[key] = value[key];
  }
}

export function parseHttpFailure(evidence: Evidence[]): ParsedFailureDetails {
  const result = emptyDetails();
  for (const item of evidence) {
    const text = plainText(item.content);
    const status = text.match(
      /\bHTTP(?:\/\d(?:\.\d)?)?\s+([45]\d\d)\b|\b(?:GET|POST|PUT|PATCH|DELETE|HEAD)\s+\S+\s+([45]\d\d)\b/i,
    );
    const statusCode = status?.[1] ?? status?.[2];
    if (statusCode) {
      result.metadata.status = statusCode;
      addFinding(result, "http.status", `The response reports HTTP ${statusCode}.`, [item.id]);
    }
    const request = text.match(/\b(GET|POST|PUT|PATCH|DELETE|HEAD)\s+(\S+)/);
    if (request?.[1] && request[2]) {
      result.metadata.method = request[1];
      result.metadata.url = request[2];
    }
    const network = text.match(
      /\b(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|request timed out|connection timed out)\b/i,
    );
    if (network?.[1]) {
      result.errorMessages.push(text.trim());
      result.metadata.networkError = network[1];
      addFinding(result, "http.connection", text.trim(), [item.id]);
    }
    if (/^\s*Retry-After\s*:/i.test(text)) {
      result.metadata.retryAfter = text.replace(/^\s*Retry-After\s*:\s*/i, "").trim();
      addFinding(result, "http.retry_after", text.trim(), [item.id]);
    }
    if (text.trim().startsWith("{")) {
      try {
        extractJsonFields(JSON.parse(text), result, item.id);
      } catch {
        /* Non-JSON lines still retain their submitted evidence. */
      }
    }
  }
  return result;
}
