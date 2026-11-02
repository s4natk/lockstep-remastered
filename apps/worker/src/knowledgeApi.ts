import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  KNOWLEDGE_LIMITS,
  InvestigationValidationError,
  validateKnowledgeInput,
} from "@lockstep/shared";
import type { Env } from "./env.js";
import { investigationOwner, InvestigationRepository } from "./investigationRepository.js";
import { KnowledgeCapacityError, KnowledgeRepository } from "./knowledgeRepository.js";
import { indexKnowledge, removeKnowledgeVectors } from "./knowledgeVectors.js";

export const knowledgeApi = new Hono<{ Bindings: Env; Variables: { ownerHash: string } }>();
knowledgeApi.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  const owner = await investigationOwner(c.req.header("Authorization") ?? null);
  if (!owner)
    return c.json(
      { error: "A valid private browser access key is required.", code: "unauthorized" },
      401,
    );
  c.set("ownerHash", owner);
  await next();
  c.header("Cache-Control", "no-store");
});
knowledgeApi.post(
  "/",
  bodyLimit({
    maxSize: KNOWLEDGE_LIMITS.payloadBytes,
    onError: (c) =>
      c.json(
        { error: "Context exceeds the 65536-byte payload limit.", code: "payload_too_large" },
        413,
      ),
  }),
  async (c) => {
    if (!c.req.header("content-type")?.toLowerCase().includes("application/json"))
      return c.json({ error: "Request body must be JSON.", code: "invalid_content_type" }, 415);
    let input;
    try {
      input = validateKnowledgeInput(await c.req.json());
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof InvestigationValidationError
              ? error.message
              : "Request body must contain valid context JSON.",
          code: "invalid_input",
        },
        400,
      );
    }
    const owner = c.get("ownerHash");
    if (!(await new InvestigationRepository(c.env.DB).admit(owner)))
      return c.json(
        { error: "Context upload limit reached. Wait a minute and retry.", code: "rate_limited" },
        429,
        { "Retry-After": "60" },
      );
    const repository = new KnowledgeRepository(c.env.DB);
    try {
      const document = await repository.create(owner, input);
      const indexed = await indexKnowledge(c.env.DB, owner, document.id, c.env, c.req.raw.signal);
      const { content: _content, ...summary } = document;
      return c.json(
        { ...summary, indexStatus: indexed ? ("semantic" as const) : ("keyword" as const) },
        201,
      );
    } catch (error) {
      if (error instanceof KnowledgeCapacityError)
        return c.json({ error: error.message, code: "knowledge_limit" }, 409);
      throw error;
    }
  },
);
knowledgeApi.get("/", async (c) =>
  c.json({ documents: await new KnowledgeRepository(c.env.DB).list(c.get("ownerHash")) }),
);
knowledgeApi.get("/:id", async (c) => {
  const document = await new KnowledgeRepository(c.env.DB).find(
    c.get("ownerHash"),
    c.req.param("id"),
  );
  return document
    ? c.json(document)
    : c.json({ error: "Context document not found.", code: "not_found" }, 404);
});
knowledgeApi.delete("/:id", async (c) => {
  const ids = await new KnowledgeRepository(c.env.DB).remove(c.get("ownerHash"), c.req.param("id"));
  await removeKnowledgeVectors(ids, c.env);
  return c.json({ ok: true });
});
