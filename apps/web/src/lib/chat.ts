import type { Citation, ParseResult } from "@lockstep/shared";

export type MessageIntent = "chat" | "review";

export interface TraceSpan {
  name: string;
  durationMs: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  intent?: MessageIntent;
  thinkingLabel?: string;
  parseResult?: ParseResult | null;
  citations?: Citation[];
  dropped?: string[];
  trace?: { spans: TraceSpan[] };
  error?: string;
  code?: boolean;
}

export interface ExampleCard {
  title: string;
  sql: string;
}

export function userMessageLooksLikeSql(text: string): boolean {
  return /\b(ALTER|CREATE|DROP|TRUNCATE|INSERT|UPDATE|DELETE)\b/i.test(text) || /;\s*$/.test(text.trim());
}
