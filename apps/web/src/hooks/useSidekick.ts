"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SIDEKICK_LIMITS, validateSidekickTurnInput, type FailureKind } from "@lockstep/shared";
import {
  cancelTurn,
  createThread,
  deleteKnowledge,
  deleteThread,
  getThread,
  listKnowledge,
  listThreads,
  pinThreadContext,
  sendTurn,
  sidekickRequest,
  type SidekickThread,
  type ThreadSummary,
  type KnowledgeDocumentSummary,
  type SidekickProgress,
} from "../lib/sidekickClient";
const errorText = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : "The request did not finish. Refresh to recover any saved result.";
export function useSidekick(threadId: string | null) {
  const [thread, setThread] = useState<SidekickThread | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [documents, setDocuments] = useState<KnowledgeDocumentSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<"checking" | "ai" | "evidence" | "offline">(
    "checking",
  );
  const [streaming, setStreaming] = useState("");
  const [activity, setActivity] = useState<SidekickProgress[]>([]);
  const navigation = useRef(0);
  const activeRef = useRef<SidekickThread | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const turnRef = useRef<string | null>(null);
  const mounted = useRef(true);
  const adopt = useCallback((value: SidekickThread | null) => {
    activeRef.current = value;
    setThread(value);
    setSelectedIds(value?.contextIds ?? []);
  }, []);
  const refreshLists = useCallback(async () => {
    const result = await Promise.allSettled([listThreads(), listKnowledge()]);
    if (!mounted.current) return;
    const [history, knowledge] = result;
    if (history.status === "fulfilled") setThreads(history.value);
    if (knowledge.status === "fulfilled") setDocuments(knowledge.value);
    if (history.status === "rejected") setError(errorText(history.reason));
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refreshLists();
    void sidekickRequest("/health")
      .then((value) => {
        if (!mounted.current) return;
        const configured =
          typeof value === "object" &&
          value !== null &&
          "openai" in value &&
          typeof value.openai === "object" &&
          value.openai !== null &&
          "configured" in value.openai &&
          value.openai.configured === true;
        setConnection(configured ? "ai" : "evidence");
      })
      .catch(() => {
        if (mounted.current) setConnection("offline");
      });
    return () => {
      mounted.current = false;
      requestRef.current?.abort();
    };
  }, [refreshLists]);
  useEffect(() => {
    if (threadId === activeRef.current?.id) return;
    const generation = ++navigation.current;
    requestRef.current?.abort();
    setError(null);
    setStreaming("");
    setActivity([]);
    setBusy(false);
    if (!threadId) {
      adopt(null);
      setSelectedIds([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void getThread(threadId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted && navigation.current === generation) adopt(value);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && navigation.current === generation) {
          adopt(null);
          setError(errorText(cause));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && navigation.current === generation) setLoading(false);
      });
    return () => controller.abort();
  }, [threadId, adopt]);
  const recover = async () => {
    const id = activeRef.current?.id ?? threadId;
    if (!id) return;
    const generation = navigation.current;
    setLoading(true);
    setError(null);
    try {
      const saved = await getThread(id);
      if (mounted.current && navigation.current === generation) adopt(saved);
      await refreshLists();
    } catch (cause) {
      if (mounted.current && navigation.current === generation) setError(errorText(cause));
    } finally {
      if (mounted.current && navigation.current === generation) setLoading(false);
    }
  };
  const send = async (
    message: string,
    kind?: FailureKind,
    environment?: Record<string, string>,
  ) => {
    if (busy || loading) return false;
    setError(null);
    const clientTurnId = crypto.randomUUID();
    let input;
    try {
      input = validateSidekickTurnInput({
        schemaVersion: 1,
        message,
        clientTurnId,
        requestedKind: kind,
        contextIds: selectedIds,
        environment,
      });
    } catch (cause) {
      setError(errorText(cause));
      return false;
    }
    const controller = new AbortController();
    const generation = navigation.current;
    const current = () =>
      mounted.current && navigation.current === generation && requestRef.current === controller;
    requestRef.current = controller;
    turnRef.current = clientTurnId;
    setBusy(true);
    setStreaming("");
    setActivity([]);
    let active = activeRef.current;
    const timer = window.setTimeout(
      () =>
        controller.abort(
          new DOMException(
            "The turn took longer than two minutes. Refresh to recover the saved result.",
            "TimeoutError",
          ),
        ),
      120_000,
    );
    try {
      if (!active) {
        active = await createThread(controller.signal);
        if (!current()) return false;
        adopt({ ...active, contextIds: selectedIds });
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}?thread=${encodeURIComponent(active.id)}`,
        );
      }
      if (active.status === "running")
        throw new Error(
          "This thread has an interrupted turn. Refresh or stop it before sending another message.",
        );
      const id = active.id;
      const user = {
        id: `pending-${clientTurnId}`,
        threadId: id,
        role: "user" as const,
        content: message,
        createdAt: new Date().toISOString(),
        status: "complete" as const,
        clientTurnId,
        contextIds: selectedIds,
      };
      adopt({
        ...active,
        status: "running",
        contextIds: selectedIds,
        messages: [...active.messages, user],
      });
      await sendTurn(id, { ...input, contextIds: selectedIds }, controller.signal, {
        onProgress: (next) => {
          if (current() && !controller.signal.aborted)
            setActivity((current) => [
              ...current.filter((item) => item.stage !== next.stage),
              next,
            ]);
        },
        onDelta: (content) => {
          if (current() && !controller.signal.aborted) setStreaming((current) => current + content);
        },
        onMessage: (assistant) => {
          if (current() && !controller.signal.aborted) {
            const value = activeRef.current;
            if (value)
              adopt({
                ...value,
                status: "idle",
                messages: [...value.messages.filter((item) => item.id !== assistant.id), assistant],
              });
            setStreaming("");
          }
        },
      });
      if (controller.signal.aborted || !current()) return false;
      const saved = await getThread(id);
      if (!current()) return false;
      adopt(saved);
      await refreshLists();
      return true;
    } catch (cause) {
      if (current()) {
        setStreaming("");
        setError(
          controller.signal.aborted
            ? controller.signal.reason instanceof Error &&
              controller.signal.reason.name === "TimeoutError"
              ? controller.signal.reason.message
              : "Investigation stopped. Your draft is ready to edit. Refresh this thread to see its saved status."
            : errorText(cause),
        );
        const id = active?.id;
        if (id) {
          try {
            const saved = await getThread(id);
            if (current()) adopt(saved);
          } catch {
            /* Keep the current evidence available during an outage. */
          }
        }
      }
      return false;
    } finally {
      window.clearTimeout(timer);
      if (current()) {
        setBusy(false);
        requestRef.current = null;
      }
      if (mounted.current) void refreshLists();
    }
  };
  const stop = async () => {
    const generation = navigation.current;
    const localTurnId = requestRef.current ? (turnRef.current ?? undefined) : undefined;
    requestRef.current?.abort();
    const id = activeRef.current?.id ?? threadId;
    if (id) {
      try {
        await cancelTurn(id, localTurnId);
        const saved = await getThread(id);
        if (mounted.current && navigation.current === generation) adopt(saved);
        await refreshLists();
      } catch (cause) {
        if (mounted.current && navigation.current === generation)
          setError(`Stopped locally. ${errorText(cause)} Refresh to check the saved status.`);
      }
    }
    if (mounted.current && navigation.current === generation) {
      setBusy(false);
      setStreaming("");
    }
  };
  const selectContext = async (ids: string[]) => {
    if (ids.length > SIDEKICK_LIMITS.contextIds)
      throw new Error("Pin at most 12 context sources for a thread.");
    const generation = navigation.current;
    const id = activeRef.current?.id;
    const previous = selectedIds;
    setSelectedIds(ids);
    try {
      if (id) await pinThreadContext(id, ids);
    } catch (cause) {
      if (mounted.current && generation === navigation.current) setSelectedIds(previous);
      throw cause;
    }
    if (!mounted.current || generation !== navigation.current) return;
    if (activeRef.current) adopt({ ...activeRef.current, contextIds: ids });
  };
  const added = async (document: KnowledgeDocumentSummary) => {
    if (!mounted.current) return;
    setDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)]);
    if (selectedIds.length < SIDEKICK_LIMITS.contextIds)
      await selectContext([...selectedIds, document.id]);
  };
  const removeDocument = async (id: string) => {
    await deleteKnowledge(id);
    setDocuments((current) => current.filter((item) => item.id !== id));
    const ids = selectedIds.filter((item) => item !== id);
    setSelectedIds(ids);
    if (activeRef.current) {
      await pinThreadContext(activeRef.current.id, ids);
      adopt({ ...activeRef.current, contextIds: ids });
    }
  };
  const removeThread = async (id: string) => {
    await deleteThread(id);
    setThreads((current) => current.filter((item) => item.id !== id));
    if (activeRef.current?.id === id) {
      adopt(null);
      window.history.replaceState(null, "", window.location.pathname);
    }
  };
  return {
    thread,
    threads,
    documents,
    selectedIds,
    loading,
    busy,
    error,
    connection,
    streaming,
    activity,
    send,
    stop,
    recover,
    refreshLists,
    selectContext,
    added,
    removeDocument,
    removeThread,
    clearError: () => setError(null),
  };
}
