import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  INPUT_LIMITS,
  InvestigationValidationError,
  validateInvestigationInput,
} from "@lockstep/shared";
import type { Env } from "./env.js";
import { parseMigration } from "./parser.js";
import { investigationOwner, InvestigationRepository } from "./investigationRepository.js";
import { investigateFailure } from "./investigationWorkflow.js";

export const investigationApi = new Hono<{ Bindings: Env; Variables: { ownerHash: string } }>();
investigationApi.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  const ownerHash = await investigationOwner(c.req.header("Authorization") ?? null);
  if (!ownerHash)
    return c.json(
      { error: "A valid private browser access key is required.", code: "unauthorized" },
      401,
    );
  c.set("ownerHash", ownerHash);
  await next();
});

investigationApi.post("/", async (c) => {
  if (!c.req.header("content-type")?.includes("application/json"))
    return c.json({ error: "Request body must be JSON.", code: "invalid_content_type" }, 415);
  let input;
  try {
    const contentLength = Number(c.req.header("content-length") ?? 0);
    if (contentLength > INPUT_LIMITS.payloadBytes)
      return c.json(
        { error: "Request exceeds the payload limit.", code: "payload_too_large" },
        413,
      );
    const bytes = await readBoundedBody(c.req.raw, INPUT_LIMITS.payloadBytes);
    input = validateInvestigationInput(JSON.parse(bytes));
  } catch (error) {
    if (error instanceof PayloadLimitError)
      return c.json(
        { error: "Request exceeds the payload limit.", code: "payload_too_large" },
        413,
      );
    return c.json(
      {
        error:
          error instanceof InvestigationValidationError
            ? error.message
            : "Request body must contain valid investigation JSON.",
        code: "invalid_input",
      },
      400,
    );
  }
  const repository = new InvestigationRepository(c.env.DB);
  const owner = c.get("ownerHash");
  if (!(await repository.admit(owner)))
    return c.json(
      { error: "Investigation limit reached. Wait a minute and retry.", code: "rate_limited" },
      429,
      { "Retry-After": "60" },
    );
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await repository.begin(owner, id, input.requestedKind ?? "unknown", createdAt);
  const run = async (signal: AbortSignal, emit?: (value: unknown) => Promise<void>) => {
    try {
      await emit?.({
        type: "stage",
        schemaVersion: 1,
        sessionId: id,
        stage: "validating",
        message: "Input accepted",
        timestamp: createdAt,
      });
      const report = await investigateFailure(input, {
        env: c.env,
        parseSql: parseMigration,
        sessionId: id,
        createdAt,
        signal,
        onProgress: async (event) => {
          await emit?.({ type: "stage", ...event });
        },
      });
      signal.throwIfAborted();
      await emit?.({
        type: "stage",
        schemaVersion: 1,
        sessionId: id,
        stage: "persisting",
        message: "Saving your private investigation",
        timestamp: new Date().toISOString(),
      });
      await repository.save(owner, report);
      await emit?.({ type: "report", report });
      await emit?.({ type: "done", sessionId: id });
      return report;
    } catch (error) {
      await repository.finish(owner, id, signal.aborted ? "cancelled" : "failed");
      throw error;
    }
  };
  if (c.req.header("accept")?.includes("text/event-stream")) {
    return streamSSE(c, async (stream) => {
      const controller = new AbortController();
      stream.onAbort(() => controller.abort());
      const signal = AbortSignal.any([controller.signal, c.req.raw.signal]);
      try {
        await run(signal, async (value) => {
          await stream.writeSSE({ data: JSON.stringify(value) });
        });
      } catch {
        if (!signal.aborted)
          await stream.writeSSE({
            data: JSON.stringify({
              type: "error",
              error: "The investigation could not finish. Please retry.",
              code: "investigation_failed",
            }),
          });
      }
    });
  }
  try {
    return c.json(await run(c.req.raw.signal));
  } catch {
    return c.json(
      { error: "The investigation could not finish. Please retry.", code: "investigation_failed" },
      503,
    );
  }
});
investigationApi.get("/", async (c) =>
  c.json({ investigations: await new InvestigationRepository(c.env.DB).list(c.get("ownerHash")) }),
);
investigationApi.get("/:id", async (c) => {
  const result = await new InvestigationRepository(c.env.DB).find(
    c.get("ownerHash"),
    c.req.param("id"),
  );
  if (!result) return c.json({ error: "Investigation not found.", code: "not_found" }, 404);
  if (!result.report)
    return c.json(
      {
        error: `This investigation is ${result.status}. Start a new investigation to retry.`,
        code: "incomplete_investigation",
        status: result.status,
      },
      409,
    );
  return c.json(result.report);
});
investigationApi.delete("/:id", async (c) => {
  await new InvestigationRepository(c.env.DB).remove(c.get("ownerHash"), c.req.param("id"));
  return c.json({ ok: true });
});

class PayloadLimitError extends Error {}
async function readBoundedBody(request: Request, limit: number): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new PayloadLimitError();
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(combined);
}
