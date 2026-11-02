"use client";

import { useEffect, useRef, useState } from "react";
import type { Citation, ParseResult } from "@lockstep/shared";

import type { ChatMessage, MessageIntent, TraceSpan } from "./chat";
import { userMessageLooksLikeSql } from "./chat";
import { reviewSocketUrl } from "./worker";

export function useReview() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    return () => {
      generation.current += 1;
      socketRef.current?.close();
    };
  }, []);

  function reset() {
    generation.current += 1;
    socketRef.current?.close();
    socketRef.current = null;
    setBusy(false);
    setMessages([]);
  }

  function sendMessage(text: string, context: string[]): boolean {
    const trimmed = text.trim();
    if (busy || trimmed === "") {
      return false;
    }
    const gen = generation.current + 1;
    generation.current = gen;
    const assistantId = crypto.randomUUID();
    const code = userMessageLooksLikeSql(trimmed);
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: trimmed, code },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        pending: true,
        thinkingLabel: code ? "Reviewing migration" : "Thinking",
      },
    ]);
    setBusy(true);

    let socket: WebSocket;
    try {
      socket = new WebSocket(reviewSocketUrl(crypto.randomUUID()));
    } catch {
      fail(gen, assistantId, "Could not reach the worker. Start it on port 8787.");
      return true;
    }
    socketRef.current = socket;
    let settled = false;

    function settle(error?: string) {
      if (generation.current !== gen || settled) {
        return;
      }
      settled = true;
      setBusy(false);
      if (error !== undefined) {
        updateAssistant(assistantId, (message) => ({
          ...message,
          pending: false,
          error,
        }));
      }
    }

    socket.addEventListener("open", () => {
      if (generation.current !== gen) {
        socket.close();
        return;
      }
      socket.send(JSON.stringify({ type: "message", text: trimmed, context }));
    });
    socket.addEventListener("message", (event) => {
      if (generation.current !== gen) {
        return;
      }
      let message: unknown;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!isRecord(message) || typeof message.type !== "string") {
        return;
      }
      if (message.type === "intent" && typeof message.intent === "string") {
        const intent = message.intent as MessageIntent;
        updateAssistant(assistantId, (current) => ({
          ...current,
          intent,
          thinkingLabel: intent === "review" ? "Reviewing migration" : "Thinking",
        }));
      }
      if (message.type === "parse" && isRecord(message.result)) {
        updateAssistant(assistantId, (current) => ({
          ...current,
          intent: "review",
          thinkingLabel: "Drafting rollout note",
          parseResult: message.result as unknown as ParseResult,
        }));
      }
      if (message.type === "token" && typeof message.content === "string") {
        const content = message.content;
        updateAssistant(assistantId, (current) => ({
          ...current,
          content: current.content + content,
        }));
      }
      if (message.type === "done") {
        settled = true;
        setBusy(false);
        if (typeof message.reply === "string") {
          const reply = message.reply;
          updateAssistant(assistantId, (current) => ({
            ...current,
            content: reply,
            pending: false,
            intent: "chat",
          }));
        } else if (typeof message.note === "string") {
          const note = message.note;
          const citations = Array.isArray(message.citations) ? (message.citations as Citation[]) : [];
          const dropped = Array.isArray(message.dropped)
            ? message.dropped.filter((entry): entry is string => typeof entry === "string")
            : [];
          const trace = readTrace(message.trace);
          updateAssistant(assistantId, (current) => ({
            ...current,
            content: note,
            pending: false,
            intent: "review",
            citations,
            dropped,
            trace,
          }));
        }
        socket.close();
      }
      if (message.type === "error" && typeof message.error === "string") {
        settle(message.error);
        socket.close();
      }
    });
    socket.addEventListener("error", () => {
      settle("Could not reach the worker. Start it on port 8787.");
    });
    socket.addEventListener("close", () => {
      if (generation.current !== gen || settled) {
        return;
      }
      settle("The connection closed before the reply finished.");
    });
    return true;
  }

  function fail(gen: number, assistantId: string, error: string) {
    if (generation.current !== gen) {
      return;
    }
    setBusy(false);
    updateAssistant(assistantId, (message) => ({ ...message, pending: false, error }));
  }

  function updateAssistant(id: string, update: (message: ChatMessage) => ChatMessage) {
    setMessages((current) =>
      current.map((message) => (message.id === id ? update(message) : message)),
    );
  }

  return { messages, busy, sendMessage, reset };
}

function readTrace(value: unknown): { spans: TraceSpan[] } {
  if (!isRecord(value) || !Array.isArray(value.spans)) {
    return { spans: [] };
  }
  const spans = value.spans.flatMap((span) => {
    if (!isRecord(span) || typeof span.name !== "string" || typeof span.durationMs !== "number") {
      return [];
    }
    return [{ name: span.name, durationMs: span.durationMs }];
  });
  return { spans };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
