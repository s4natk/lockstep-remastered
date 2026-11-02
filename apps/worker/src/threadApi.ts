import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import {
  detectFailureKind,
  InvestigationValidationError,
  SIDEKICK_LIMITS,
  validateSidekickTurnInput,
  type Evidence,
  type SidekickEvent,
  type SidekickThread,
  type SidekickTurnInput,
} from "@lockstep/shared";
import type { Env } from "./env.js";
import { investigationOwner, InvestigationRepository } from "./investigationRepository.js";
import { investigateFailure } from "./investigationWorkflow.js";
import { retrieveInvestigationEvidence } from "./investigationRetrieval.js";
import { KnowledgeRepository } from "./knowledgeRepository.js";
import { readKnowledgeContext, searchKnowledge } from "./knowledgeSearch.js";
import { parseMigration } from "./parser.js";
import { ThreadRepository, ThreadStoreError, reportToMarkdown } from "./threadRepository.js";

export const threadApi = new Hono<{ Bindings: Env; Variables: { ownerHash: string } }>();
const activeRequests = new Map<string, AbortController>();
threadApi.use(
  "*",
  bodyLimit({
    maxSize: SIDEKICK_LIMITS.payloadBytes,
    onError: (c) =>
      c.json(
        { error: "The request exceeds the 65536-byte payload limit.", code: "payload_too_large" },
        413,
      ),
  }),
);
threadApi.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  const owner = await investigationOwner(c.req.header("Authorization") ?? null);
  if (!owner)
    return c.json(
      { error: "A private browser access key is required.", code: "unauthorized" },
      401,
    );
  c.set("ownerHash", owner);
  await next();
  c.header("Cache-Control", "no-store");
});
threadApi.get("/", async (c) => {
  const repository = new ThreadRepository(c.env.DB);
  await repository.importLegacy(c.get("ownerHash"));
  return c.json({ threads: await repository.list(c.get("ownerHash")) });
});
threadApi.post("/", async (c) => {
  const body = await c.req.json<unknown>().catch(() => null);
  if (
    !record(body) ||
    (body.title !== undefined &&
      (typeof body.title !== "string" || !body.title.trim() || body.title.length > 200))
  )
    return c.json(
      {
        error: "Use a JSON object with an optional short investigation title.",
        code: "invalid_input",
      },
      400,
    );
  try {
    return c.json(
      await new ThreadRepository(c.env.DB).create(
        c.get("ownerHash"),
        typeof body.title === "string" ? body.title.trim() : undefined,
      ),
      201,
    );
  } catch (error) {
    if (error instanceof ThreadStoreError)
      return c.json({ error: error.message, code: error.code }, 409);
    throw error;
  }
});
threadApi.get("/:id", async (c) => {
  const thread = await new ThreadRepository(c.env.DB).find(c.get("ownerHash"), c.req.param("id"));
  if (!thread)
    return c.json(
      { error: "Investigation not found in this browser's private history.", code: "not_found" },
      404,
    );
  return c.json(thread);
});
threadApi.patch("/:id/context", async (c) => {
  const repository = new ThreadRepository(c.env.DB);
  const owner = c.get("ownerHash");
  const thread = await repository.find(owner, c.req.param("id"));
  if (!thread) return c.json({ error: "Investigation not found.", code: "not_found" }, 404);
  const body = await c.req.json<unknown>().catch(() => null);
  if (!record(body) || body.schemaVersion !== 1 || !validContextIds(body.contextIds))
    return c.json(
      {
        error: "Select at most 12 distinct context documents using schemaVersion 1.",
        code: "invalid_context",
      },
      400,
    );
  if (!(await ownedContextIds(c.env.DB, owner, body.contextIds)))
    return c.json(
      {
        error: "One or more context documents are unavailable in this browser.",
        code: "context_not_found",
      },
      404,
    );
  if (!(await repository.setContext(owner, thread.id, body.contextIds)))
    return c.json(
      { error: "Wait for this turn to finish before changing its context.", code: "thread_busy" },
      409,
    );
  return c.json(await repository.find(owner, thread.id));
});
threadApi.post("/:id/cancel", async (c) => {
  const owner = c.get("ownerHash");
  const id = c.req.param("id");
  const repository = new ThreadRepository(c.env.DB);
  const cancelBody = await c.req.json<unknown>().catch(() => ({}));
  if (
    !record(cancelBody) ||
    (cancelBody.clientTurnId !== undefined &&
      (typeof cancelBody.clientTurnId !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(cancelBody.clientTurnId)))
  )
    return c.json(
      { error: "Use a valid turn ID when stopping a specific turn.", code: "invalid_input" },
      400,
    );
  // Capture before the database releases this turn so a successor keeps its controller.
  const activeRequest = activeRequests.get(`${owner}:${id}`);
  let cancelled: boolean;
  try {
    cancelled = await repository.cancel(
      owner,
      id,
      typeof cancelBody.clientTurnId === "string" ? cancelBody.clientTurnId : undefined,
    );
  } catch (error) {
    if (error instanceof ThreadStoreError)
      return c.json({ error: error.message, code: error.code }, 409);
    throw error;
  }
  if (!cancelled) return c.json({ error: "Investigation not found.", code: "not_found" }, 404);
  activeRequest?.abort();
  return c.json(await repository.find(owner, id));
});
threadApi.delete("/:id", async (c) => {
  const owner = c.get("ownerHash");
  const id = c.req.param("id");
  const repository = new ThreadRepository(c.env.DB);
  if (!(await repository.remove(owner, id)))
    return c.json({ error: "Investigation not found.", code: "not_found" }, 404);
  activeRequests.get(`${owner}:${id}`)?.abort();
  return c.json({ ok: true });
});
threadApi.post("/:id/messages", async (c) => {
  if (!c.req.header("content-type")?.includes("application/json"))
    return c.json(
      { error: "Send an investigation message as JSON.", code: "invalid_content_type" },
      415,
    );
  let input: SidekickTurnInput;
  try {
    input = validateSidekickTurnInput(await c.req.json<unknown>());
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof InvestigationValidationError
            ? error.message
            : "The message must contain valid JSON.",
        code: "invalid_input",
      },
      400,
    );
  }
  const owner = c.get("ownerHash");
  const repository = new ThreadRepository(c.env.DB);
  const thread = await repository.find(owner, c.req.param("id"));
  if (!thread) return c.json({ error: "Investigation not found.", code: "not_found" }, 404);
  const previous = await repository.turn(owner, thread.id, input.clientTurnId);
  const streaming = c.req.header("accept")?.includes("text/event-stream");
  if (previous) {
    const previousInput = await repository.input(owner, thread.id, input.clientTurnId);
    if (
      previousInput &&
      ((input.requestedKind !== undefined && input.requestedKind !== previousInput.requestedKind) ||
        (input.environment !== undefined &&
          JSON.stringify(Object.entries(input.environment).sort()) !==
            JSON.stringify(Object.entries(previousInput.environment ?? {}).sort())))
    )
      return c.json(
        {
          error:
            "This turn ID already belongs to different investigation options. Use a new turn ID for a changed message.",
          code: "turn_conflict",
        },
        409,
      );
    if (
      previous.user?.content !== input.message ||
      (input.contextIds &&
        JSON.stringify(previous.user.contextIds ?? []) !== JSON.stringify(input.contextIds))
    )
      return c.json(
        {
          error:
            "This turn ID already belongs to a different message. Send a new turn ID for a new message.",
          code: "turn_conflict",
        },
        409,
      );
    if (previous.pending)
      return c.json(
        {
          error:
            "This message is already being investigated. Refresh this thread for its saved result.",
          code: "turn_in_progress",
        },
        409,
      );
    if (!previous.assistant || previous.assistant.status !== "complete")
      return c.json(
        {
          error: "This turn was interrupted. Send a new message to retry.",
          code: "turn_interrupted",
        },
        409,
      );
    const message = previous.assistant;
    if (!streaming) return c.json({ message });
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ data: JSON.stringify({ type: "message", message }) });
      await stream.writeSSE({
        data: JSON.stringify({ type: "done", threadId: thread.id, turnId: input.clientTurnId }),
      });
    });
  }
  let contextIds = input.contextIds ?? thread.contextIds;
  if (input.contextIds && !(await ownedContextIds(c.env.DB, owner, contextIds)))
    return c.json(
      {
        error: "An attached context document was deleted or is unavailable to this browser.",
        code: "context_not_found",
      },
      404,
    );
  if (!input.contextIds) {
    const available = new Set(
      (await new KnowledgeRepository(c.env.DB).list(owner)).map((doc) => doc.id),
    );
    contextIds = contextIds.filter((id) => available.has(id));
  }
  if (thread.status === "running")
    return c.json(
      {
        error: "Another turn is running. Wait for it or stop it before sending a new message.",
        code: "thread_busy",
      },
      409,
    );
  if (!(await new InvestigationRepository(c.env.DB).admit(owner)))
    return c.json(
      {
        error: "The investigation limit has been reached. Wait a minute before trying again.",
        code: "rate_limited",
      },
      429,
      { "Retry-After": "60" },
    );
  let started: Awaited<ReturnType<ThreadRepository["beginTurn"]>>;
  try {
    started = await repository.beginTurn(owner, thread, input, contextIds);
  } catch (error) {
    if (error instanceof ThreadStoreError)
      return c.json({ error: error.message, code: error.code }, 409);
    throw error;
  }
  const run = async (
    controller: AbortController,
    emit?: (event: SidekickEvent) => Promise<void>,
  ) => {
    const key = `${owner}:${thread.id}`;
    activeRequests.set(key, controller);
    const signal = AbortSignal.any([
      controller.signal,
      c.req.raw.signal,
      AbortSignal.timeout(90_000),
    ]);
    let polling = false;
    const timer = setInterval(() => {
      if (polling || signal.aborted) return;
      polling = true;
      void repository
        .isActive(owner, thread.id, input.clientTurnId)
        .then((active) => {
          if (!active) controller.abort();
        })
        .catch(() => controller.abort())
        .finally(() => {
          polling = false;
        });
    }, 1_000);
    const progress = async (stage: "validating" | "persisting", message: string) => {
      signal.throwIfAborted();
      await emit?.({
        type: "stage",
        schemaVersion: 1,
        sessionId: started.assistantId,
        timestamp: new Date().toISOString(),
        threadId: thread.id,
        turnId: input.clientTurnId,
        stage,
        message,
      });
    };
    try {
      await emit?.({
        type: "thread",
        thread: {
          id: thread.id,
          title: thread.messages.length
            ? thread.title
            : input.message
                .split(/\r?\n/)
                .find((line) => line.trim())
                ?.trim()
                .slice(0, 100) || "New investigation",
          kind: thread.kind,
          createdAt: thread.createdAt,
          updatedAt: new Date().toISOString(),
          status: "running",
          lastPreview: thread.lastPreview,
        },
      });
      await progress("validating", "Message accepted; loading this investigation's saved context");
      const contextEvidence = await readKnowledgeContext(c.env.DB, owner, contextIds);
      const anchor = failureAnchor(thread, input);
      const originalInput = await repository.input(owner, thread.id, anchor.clientTurnId);
      const environment = { ...originalInput?.environment, ...input.environment };
      const report = await investigateFailure(
        {
          schemaVersion: 1,
          rawInput: anchor.content,
          requestedKind:
            input.requestedKind ?? (anchor.kind !== "unknown" ? anchor.kind : undefined),
          environment: Object.keys(environment).length ? environment : undefined,
        },
        {
          env: c.env,
          parseSql: parseMigration,
          sessionId: started.assistantId,
          createdAt: new Date().toISOString(),
          signal,
          question: input.message,
          conversation: thread.messages
            .filter((message) => message.status === "complete")
            .slice(-10)
            .map((message) => ({ role: message.role, content: message.content.slice(0, 8_000) })),
          contextEvidence,
          retrieve: async (context, retrievalSignal, query) => {
            const base = await retrieveInvestigationEvidence(
              context,
              c.env,
              retrievalSignal,
              query,
            );
            const knowledge = await searchKnowledge(
              c.env.DB,
              owner,
              query ?? input.message,
              undefined,
              { env: c.env, signal: retrievalSignal },
            );
            const pinned = new Set(contextEvidence.map((item) => item.id));
            return {
              ...base,
              evidence: mergeEvidence(
                base.evidence,
                knowledge.filter((item) => !pinned.has(item.id)),
              ),
            };
          },
          onProgress: async (event) => {
            signal.throwIfAborted();
            if (!(await repository.isActive(owner, thread.id, input.clientTurnId))) {
              controller.abort();
              signal.throwIfAborted();
            }
            await emit?.({
              type: "stage",
              ...event,
              threadId: thread.id,
              turnId: input.clientTurnId,
            });
          },
          onText: async (content) => {
            signal.throwIfAborted();
            for (let offset = 0; offset < content.length; offset += 8192) {
              await emit?.({
                type: "delta",
                threadId: thread.id,
                turnId: input.clientTurnId,
                content: content.slice(offset, offset + 8192),
                provisional: true,
              });
            }
          },
        },
      );
      signal.throwIfAborted();
      await progress("persisting", "Saving this turn and its validated evidence");
      const message = await repository.complete(
        owner,
        thread.id,
        input.clientTurnId,
        started.assistantId,
        report,
        report.assistantAnswer ?? reportToMarkdown(report),
      );
      await emit?.({ type: "message", message });
      await emit?.({ type: "done", threadId: thread.id, turnId: input.clientTurnId });
      return message;
    } catch (error) {
      await repository.finish(
        owner,
        thread.id,
        input.clientTurnId,
        signal.aborted ? "cancelled" : "failed",
      );
      throw error;
    } finally {
      clearInterval(timer);
      if (activeRequests.get(key) === controller) activeRequests.delete(key);
    }
  };
  if (streaming)
    return streamSSE(c, async (stream) => {
      const controller = new AbortController();
      stream.onAbort(() => controller.abort());
      try {
        await run(controller, async (event) => {
          await stream.writeSSE({ data: JSON.stringify(event) });
        });
      } catch {
        if (!controller.signal.aborted)
          await stream.writeSSE({
            data: JSON.stringify({
              type: "error",
              threadId: thread.id,
              turnId: input.clientTurnId,
              error:
                "This turn could not finish. Your conversation is saved; refresh it or send a new message to retry.",
              code: "turn_failed",
            }),
          });
      }
    });
  try {
    return c.json({ message: await run(new AbortController()) });
  } catch {
    return c.json(
      {
        error: "This turn could not finish. Your saved thread is available in history.",
        code: "turn_failed",
      },
      503,
    );
  }
});
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validContextIds(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= SIDEKICK_LIMITS.contextIds &&
    value.every((id: unknown) => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id)) &&
    new Set(value).size === value.length
  );
}
async function ownedContextIds(db: D1Database, owner: string, ids: string[]): Promise<boolean> {
  const repository = new KnowledgeRepository(db);
  return (await Promise.all(ids.map((id) => repository.find(owner, id)))).every(Boolean);
}
function mergeEvidence(first: Evidence[], second: Evidence[]): Evidence[] {
  return [...new Map([...first, ...second].map((item) => [item.id, item])).values()];
}
function failureAnchor(
  thread: SidekickThread,
  input: SidekickTurnInput,
): { content: string; kind: ReturnType<typeof detectFailureKind>; clientTurnId: string } {
  const current = detectFailureKind(input.message);
  if (current !== "unknown")
    return { content: input.message, kind: current, clientTurnId: input.clientTurnId };
  for (const message of [...thread.messages].reverse()) {
    if (message.role !== "user") continue;
    const kind = detectFailureKind(message.content);
    if (kind !== "unknown")
      return { content: message.content, kind, clientTurnId: message.clientTurnId };
  }
  return { content: input.message, kind: "unknown", clientTurnId: input.clientTurnId };
}
