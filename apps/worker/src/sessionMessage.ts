export interface SessionMessage {
  kind: "review" | "message";
  text: string;
  context: string[];
}

export function readSessionMessage(raw: string): SessionMessage | { error: string } {
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

  if (!("context" in record) || record.context === undefined) {
    return { kind, text, context: [] };
  }
  if (!Array.isArray(record.context) || record.context.some((entry) => typeof entry !== "string")) {
    return { error: "context must be an array of strings" };
  }
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
