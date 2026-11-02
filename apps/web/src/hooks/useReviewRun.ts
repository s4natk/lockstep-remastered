"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ServerEvent } from "../lib/protocol";
import { emptyProgress, type ContextRef, type ReviewRecord } from "../lib/review";
import { openSession, type SessionHandle } from "../lib/socket";

/**
 * Applies one Worker event to a live review. Shared by the review workspace and
 * the Ask thread, which can route pasted SQL to a review.
 */
export function applyReviewEvent(record: ReviewRecord, event: ServerEvent): ReviewRecord {
  const progress = { ...record.progress, connected: true };
  switch (event.type) {
    case "intent":
      if (event.intent === "chat") {
        return { ...record, progress, reply: record.reply ?? "" };
      }
      return { ...record, progress, status: "parsing" };
    case "parse":
      return {
        ...record,
        parse: event.result,
        progress: { ...progress, parsed: true, retrieving: true },
        status: "retrieving",
      };
    case "stage":
      if (event.stage === "retrieve") {
        return { ...record, progress: { ...progress, retrieving: true }, status: "retrieving" };
      }
      return { ...record, progress: { ...progress, retrieving: true, drafting: true }, status: "drafting" };
    case "token":
      if (record.reply !== undefined) {
        return { ...record, progress, reply: record.reply + event.content };
      }
      return {
        ...record,
        progress: { ...progress, retrieving: true, drafting: true },
        status: "drafting",
        draft: (record.draft ?? "") + event.content,
      };
    case "review-done":
      return {
        ...record,
        progress: { connected: true, parsed: true, retrieving: true, drafting: true },
        status: "completed",
        finishedAt: Date.now(),
        note: event.note,
        citations: event.citations,
        dropped: event.dropped,
        trace: event.trace,
      };
    case "chat-done":
      return {
        ...record,
        progress,
        status: "failed",
        finishedAt: Date.now(),
        reply: event.reply,
        failure: "answered-as-chat",
        error: "The Worker answered this input as a question instead of reviewing it as a migration.",
      };
    case "error":
      return { ...record, progress, status: "failed", finishedAt: Date.now(), error: event.error, failure: "worker" };
  }
}

export function newLiveReview(sql: string, context: ContextRef[], drafter?: "live" | "mock"): ReviewRecord {
  return {
    id: crypto.randomUUID(),
    sql,
    createdAt: Date.now(),
    status: "connecting",
    origin: "live",
    progress: emptyProgress(),
    draft: "",
    context,
    drafter,
  };
}

interface Options {
  onComplete: (record: ReviewRecord) => void;
}

export function useReviewRun({ onComplete }: Options) {
  const [record, setRecord] = useState<ReviewRecord | null>(null);
  const recordRef = useRef<ReviewRecord | null>(null);
  const sessionRef = useRef<SessionHandle | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const commit = useCallback((next: ReviewRecord | null) => {
    recordRef.current = next;
    setRecord(next);
  }, []);

  const closeSession = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
  }, []);

  useEffect(() => closeSession, [closeSession]);

  const start = useCallback(
    (sql: string, context: ContextRef[], drafter?: "live" | "mock") => {
      closeSession();
      const initial = newLiveReview(sql, context, drafter);
      commit(initial);

      const update = (apply: (current: ReviewRecord) => ReviewRecord) => {
        const current = recordRef.current;
        if (current === null || current.id !== initial.id) {
          return;
        }
        const next = apply(current);
        commit(next);
        if (next.status === "completed" && current.status !== "completed") {
          onCompleteRef.current(next);
        }
      };

      sessionRef.current = openSession(
        initial.id,
        { type: "review", sql, context: context.map((entry) => entry.text) },
        {
          onOpen: () => update((current) => ({ ...current, progress: { ...current.progress, connected: true } })),
          onEvent: (event) => update((current) => applyReviewEvent(current, event)),
          onFailure: (message) =>
            update((current) => ({
              ...current,
              status: "failed",
              finishedAt: Date.now(),
              error: message,
              failure: "connection",
            })),
        },
      );
      return initial;
    },
    [closeSession, commit],
  );

  const stop = useCallback(() => {
    const current = recordRef.current;
    closeSession();
    if (current !== null && current.origin === "live" && current.status !== "completed" && current.status !== "failed") {
      commit({ ...current, status: "stopped", finishedAt: Date.now() });
    }
  }, [closeSession, commit]);

  const show = useCallback(
    (next: ReviewRecord | null) => {
      closeSession();
      commit(next);
    },
    [closeSession, commit],
  );

  return { record, start, stop, show };
}
