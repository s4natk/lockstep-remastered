import type { Evidence } from "./investigation.js";
import { addFinding, emptyDetails, plainText } from "./parsing.js";
import type { ParsedFailureDetails } from "./parsing.js";
import { isRecord } from "./validation.js";

export function parseApplicationLog(evidence: Evidence[]): ParsedFailureDetails {
  const result = emptyDetails();
  const document = evidence.find((item) => item.id === "input:document");
  for (const item of document ? [document] : evidence) {
    const text = plainText(item.content);
    let message = text.trim();
    let level = text
      .match(/\b(ERROR|WARN(?:ING)?|FATAL|CRITICAL|INFO|DEBUG)\b/i)?.[1]
      ?.toLowerCase();
    if (text.trim().startsWith("{")) {
      try {
        const event: unknown = JSON.parse(text);
        if (isRecord(event)) {
          const eventLevel = event.level ?? event.severity;
          if (typeof eventLevel === "string") level = eventLevel.toLowerCase();
          const eventMessage = event.message ?? event.msg;
          if (typeof eventMessage === "string") message = eventMessage;
          for (const key of [
            "timestamp",
            "time",
            "service",
            "requestId",
            "request_id",
            "trace_id",
          ]) {
            if (typeof event[key] === "string") result.metadata[key] = event[key];
          }
        }
      } catch {
        result.metadata.malformedJson = "true";
      }
    }
    if (level && ["error", "fatal", "critical", "warn", "warning"].includes(level)) {
      result.errorMessages.push(message);
      addFinding(result, "log.error_event", `${level.toUpperCase()}: ${message}`, [item.id]);
    }
    const timestamp = text.match(
      /\b\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)?/,
    );
    if (timestamp) result.metadata.lastTimestamp = timestamp[0];
  }
  return result;
}
