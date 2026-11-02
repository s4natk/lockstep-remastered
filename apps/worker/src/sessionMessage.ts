export interface SessionMessage {
  kind: "review" | "message";
  text: string;
  context: string[];
}

export function readSessionMessage(raw: string): SessionMessage | { error: string } {
  if (new TextEncoder().encode(raw).byteLength > 65_536)
    return { error: "Request exceeds the payload limit." };
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return { error: "Request body must be JSON." };
  }
  if (typeof message !== "object" || message === null) {
    return { error: "message is required" };
  }

  const record = message as Record<string, unknown>;
  const kind = isReview(record) ? "review" : "message";
  const text = readText(record);
  if (text === null || text.trim() === "") {
    return { error: kind === "review" ? "sql is required" : "message is required" };
  }

  if (text.length > 32_768) return { error: "Input exceeds the 32768 character limit." };
  if (!("context" in record) || record.context === undefined) {
    return { kind, text, context: [] };
  }
  if (!Array.isArray(record.context) || record.context.some((entry) => typeof entry !== "string")) {
    return { error: "context must be an array of strings" };
  }
  if (record.context.length > 20 || record.context.some((entry) => entry.length > 2000))
    return { error: "Context exceeds its size limit." };
  return { kind, text, context: record.context };
}

function isReview(message: Record<string, unknown>): boolean {
  if (message.type === "review") {
    return true;
  }
  return message.type === undefined && typeof message.sql === "string";
}

function readText(message: Record<string, unknown>): string | null {
  if ("text" in message && typeof message.text === "string") {
    return message.text;
  }
  if ("sql" in message && typeof message.sql === "string") {
    return message.sql;
  }
  if ("message" in message && typeof message.message === "string") {
    return message.message;
  }
  return null;
}
