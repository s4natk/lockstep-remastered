import type { Evidence, LogEvent } from "./investigation.js";
import { addFinding, emptyDetails, plainText } from "./parsing.js";
import type { ParsedFailureDetails } from "./parsing.js";
import { parseRuntimeFailure } from "./runtimeFailure.js";
import { isRecord } from "./validation.js";

const MAX_EVENTS = 128;
const timestampPattern =
  /^\s*(\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)?|\[\d\d\/\w+\/\d{4}:\d\d:\d\d:\d\d[^\]]*\])/;
const severityPattern = /\b(ERROR|WARN(?:ING)?|FATAL|CRITICAL|SEVERE|INFO|DEBUG|TRACE)\b/i;
function severity(value: unknown): LogEvent["severity"] {
  if (typeof value !== "string") return "unknown";
  const lower = value.toLowerCase();
  if (lower === "warn") return "warning";
  if (lower === "severe") return "error";
  return ["trace", "debug", "info", "warning", "error", "fatal", "critical"].some(
    (item) => item === lower,
  )
    ? (lower as LogEvent["severity"])
    : "unknown";
}
function addFrames(event: LogEvent, item: Evidence, result: ParsedFailureDetails): void {
  const frames = parseRuntimeFailure([item]).stackFrames;
  event.stackFrames.push(...frames.slice(0, 128 - event.stackFrames.length));
  result.stackFrames.push(...frames.slice(0, 128 - result.stackFrames.length));
  if (!event.evidenceIds.includes(item.id)) event.evidenceIds.push(item.id);
}
export function parseApplicationLog(evidence: Evidence[]): ParsedFailureDetails {
  const result = emptyDetails();
  result.logEvents = [];
  const document = evidence.find((item) => item.id === "input:document");
  let previous: LogEvent | undefined;
  let eventCount = 0;
  for (const item of document ? [document] : evidence) {
    const text = plainText(item.content);
    if (previous && /^\s+(?:at\s+|File\s+|Caused by:|Traceback)|^Caused by:/.test(text)) {
      addFrames(previous, item, result);
      continue;
    }
    const timestamp = text.match(timestampPattern)?.[1];
    const level = text.match(severityPattern)?.[1];
    let message = text.replace(timestampPattern, "").trim();
    if (level)
      message = message
        .replace(
          /^\[?(?:ERROR|WARN(?:ING)?|FATAL|CRITICAL|SEVERE|INFO|DEBUG|TRACE)\]?\s*:?\s*/i,
          "",
        )
        .trim();
    const event: LogEvent = {
      id: `log:${++eventCount}`,
      severity: severity(level),
      message,
      ...(timestamp ? { timestamp } : {}),
      evidenceIds: [item.id],
      stackFrames: [],
    };
    if (text.trim().startsWith("{")) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (isRecord(parsed)) {
          event.severity = severity(parsed.level ?? parsed.severity);
          if (typeof parsed.message === "string") event.message = parsed.message;
          else if (typeof parsed.msg === "string") event.message = parsed.msg;
          const fields = {
            timestamp: parsed.timestamp ?? parsed.time,
            service: parsed.service,
            requestId: parsed.requestId ?? parsed.request_id,
            traceId: parsed.traceId ?? parsed.trace_id,
          };
          for (const key of ["timestamp", "service", "requestId", "traceId"] as const) {
            const value = fields[key];
            if (typeof value === "string") {
              event[key] = value;
              result.metadata[key] = value;
            }
          }
          const nested = isRecord(parsed.err)
            ? parsed.err
            : isRecord(parsed.error)
              ? parsed.error
              : undefined;
          const stack = parsed.stack ?? nested?.stack;
          const stackText =
            typeof stack === "string"
              ? stack
              : Array.isArray(stack) && stack.every((line: unknown) => typeof line === "string")
                ? stack.join("\n")
                : "";
          if (stackText)
            for (const line of stackText.split(/\r\n|\n|\r/))
              addFrames(event, { ...item, content: line }, result);
        }
      } catch {
        result.metadata.malformedJson = "true";
      }
    }
    if (["error", "fatal", "critical", "warning"].includes(event.severity)) {
      result.errorMessages.push(event.message);
      addFinding(result, "log.error_event", `${event.severity.toUpperCase()}: ${event.message}`, [
        item.id,
      ]);
    }
    if (event.timestamp) result.metadata.lastTimestamp = event.timestamp;
    if (result.logEvents.length < MAX_EVENTS) result.logEvents.push(event);
    else result.metadata.logEventsOmitted = String(eventCount - MAX_EVENTS);
    previous = event;
  }
  return result;
}
