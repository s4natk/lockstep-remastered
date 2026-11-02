"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { sanitizeRecord } from "../lib/history";
import type { ContextRef, ReviewRecord } from "../lib/review";
import { openSession, type SessionHandle } from "../lib/socket";
import { isRecord, readJson, removeKey, STORAGE_KEYS, writeJson } from "../lib/storage";
import { applyReviewEvent, newLiveReview } from "./useReviewRun";

export interface AskMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  status: "waiting" | "streaming" | "done" | "error" | "stopped";
  /** Set when the Worker routed this turn to the migration reviewer. */
  review?: ReviewRecord;
  error?: string;
  /** For assistant turns: the user message they answer. */
  replyTo?: string;
}

const THREAD_LIMIT = 60;

interface Options {
  onReviewComplete: (record: ReviewRecord) => void;
}

export function useAssistant({ onReviewComplete }: Options) {
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const messagesRef = useRef<AskMessage[]>([]);
  const sessionRef = useRef<SessionHandle | null>(null);
  const onReviewRef = useRef(onReviewComplete);
  onReviewRef.current = onReviewComplete;

  const commit = useCallback((next: AskMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  useEffect(() => {
    commit(loadThread());
    return () => sessionRef.current?.close();
  }, [commit]);

  useEffect(() => {
    const settled = messages.filter((message) => message.status !== "waiting" && message.status !== "streaming");
    if (settled.length === messages.length) {
      if (messages.length === 0) {
        removeKey(STORAGE_KEYS.thread);
      } else {
        writeJson(STORAGE_KEYS.thread, messages.slice(-THREAD_LIMIT));
      }
    }
  }, [messages]);

  const busy = messages.some((message) => message.status === "waiting" || message.status === "streaming");

  const run = useCallback(
    (userMessage: AskMessage, context: ContextRef[], base: AskMessage[]) => {
      sessionRef.current?.close();
      const assistant: AskMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: "",
        createdAt: Date.now(),
        status: "waiting",
        replyTo: userMessage.id,
      };
      commit([...base, assistant]);

      const update = (apply: (current: AskMessage) => AskMessage) => {
        const list = messagesRef.current;
        const at = list.findIndex((message) => message.id === assistant.id);
        if (at === -1) {
          return;
        }
        const previous = list[at]!;
        const next = apply(previous);
        commit([...list.slice(0, at), next, ...list.slice(at + 1)]);
        if (next.review?.status === "completed" && previous.review?.status !== "completed") {
          onReviewRef.current(next.review);
        }
      };

      const reviewSeed = newLiveReview(userMessage.text, context);
      sessionRef.current = openSession(
        reviewSeed.id,
        { type: "message", text: userMessage.text, context: context.map((entry) => entry.text) },
        {
          onOpen: () => undefined,
          onEvent: (event) =>
            update((current) => {
              if (event.type === "intent") {
                if (event.intent === "review") {
                  return { ...current, review: applyReviewEvent(reviewSeed, event) };
                }
                return { ...current, review: undefined };
              }
              if (current.review) {
                const review = applyReviewEvent(current.review, event);
                return {
                  ...current,
                  review,
                  status: review.status === "completed" ? "done" : review.status === "failed" ? "error" : "streaming",
                  error: review.status === "failed" ? review.error : undefined,
                  text: review.status === "completed" ? (review.note ?? "") : current.text,
                };
              }
              switch (event.type) {
                case "token":
                  return { ...current, status: "streaming", text: current.text + event.content };
                case "chat-done":
                  return { ...current, status: "done", text: event.reply };
                case "error":
                  return { ...current, status: "error", error: event.error };
                default:
                  return current;
              }
            }),
          onFailure: (message) =>
            update((current) => ({
              ...current,
              status: "error",
              error: message,
              review: current.review ? { ...current.review, status: "failed", error: message } : undefined,
            })),
        },
      );
    },
    [commit],
  );

  const send = useCallback(
    (text: string, context: ContextRef[]) => {
      const trimmed = text.trim();
      if (trimmed === "" || busy) {
        return false;
      }
      const user: AskMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text: trimmed,
        createdAt: Date.now(),
        status: "done",
      };
      run(user, context, [...messagesRef.current, user]);
      return true;
    },
    [busy, run],
  );

  const retry = useCallback(
    (assistantId: string, context: ContextRef[]) => {
      const list = messagesRef.current;
      const failed = list.find((message) => message.id === assistantId);
      const user = list.find((message) => message.id === failed?.replyTo);
      if (!failed || !user || busy) {
        return;
      }
      run(
        user,
        context,
        list.filter((message) => message.id !== assistantId),
      );
    },
    [busy, run],
  );

  const stop = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    commit(
      messagesRef.current.map((message) =>
        message.status === "waiting" || message.status === "streaming"
          ? {
              ...message,
              status: "stopped",
              review: message.review ? { ...message.review, status: "stopped" } : undefined,
            }
          : message,
      ),
    );
  }, [commit]);

  const clear = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    commit([]);
  }, [commit]);

  return { messages, busy, send, retry, stop, clear };
}

function loadThread(): AskMessage[] {
  const raw = readJson<unknown>(STORAGE_KEYS.thread, []);
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item): AskMessage[] => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      (item.role !== "user" && item.role !== "assistant") ||
      typeof item.text !== "string" ||
      typeof item.createdAt !== "number"
    ) {
      return [];
    }
    const status = item.status === "error" || item.status === "stopped" ? item.status : "done";
    const review = item.review === undefined ? undefined : (sanitizeRecord(item.review) ?? undefined);
    return [
      {
        id: item.id,
        role: item.role,
        text: item.text,
        createdAt: item.createdAt,
        status,
        review: review ? { ...review, origin: "live" } : undefined,
        error: typeof item.error === "string" ? item.error : undefined,
        replyTo: typeof item.replyTo === "string" ? item.replyTo : undefined,
      },
    ];
  });
}
