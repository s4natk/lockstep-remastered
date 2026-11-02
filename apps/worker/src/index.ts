import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";

import type { Env } from "./env.js";
import { allowedOrigins } from "./origins.js";
import { parseMigration, MigrationParseError } from "./parser.js";
import { ReviewSession } from "./reviewSession.js";
import { SessionRepository } from "./sessionRepository.js";
import { investigationApi } from "./investigationApi.js";
import { investigationOwner } from "./investigationRepository.js";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: (origin, c) => (allowedOrigins(c.env.ALLOWED_ORIGINS).includes(origin) ? origin : null),
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

function healthBody(env: Env) {
  const key = env.OPENAI_API_KEY;
  const configured = key !== undefined && key.trim() !== "";
  return {
    ok: true,
    timestamp: new Date().toISOString(),
    openai: {
      configured,
      chatModel: env.OPENAI_MODEL ?? "gpt-4.1-mini",
      mode: configured ? "live" : "deterministic",
    },
  };
}

app.get("/", (c) => c.json(healthBody(c.env)));
app.get("/health", (c) => c.json(healthBody(c.env)));

app.route("/api/investigations", investigationApi);

app.use(
  "/api/parse",
  bodyLimit({
    maxSize: 65_536,
    onError: (c) => c.json({ error: "Request exceeds the payload limit." }, 413),
  }),
);
app.post("/api/parse", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be JSON." }, 400);
  }

  const sql =
    typeof body === "object" && body !== null && "sql" in body && typeof body.sql === "string"
      ? body.sql
      : "";
  if (sql.length > 32_768) return c.json({ error: "SQL exceeds the 32768 character limit." }, 413);
  if (sql.trim() === "") {
    return c.json({ error: "sql is required" }, 400);
  }

  try {
    return c.json(await parseMigration(sql));
  } catch (error) {
    if (error instanceof MigrationParseError) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

app.get("/agent/connect/:sessionId", async (c) => {
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket")
    return c.json({ error: "Expected WebSocket upgrade." }, 426);
  const protocols = (c.req.header("Sec-WebSocket-Protocol") ?? "")
    .split(",")
    .map((value) => value.trim());
  const capability = protocols.find((value) => value.startsWith("capability."))?.slice(11);
  const owner = await investigationOwner(`Bearer ${capability ?? ""}`);
  const origin = c.req.header("Origin");
  if (origin && !allowedOrigins(c.env.ALLOWED_ORIGINS).includes(origin))
    return c.json({ error: "Origin is not allowed." }, 403);
  if (!owner) return c.json({ error: "Private browser access key required." }, 401);
  const repository = new SessionRepository(c.env.DB);
  if (!(await repository.claimOwner(c.req.param("sessionId"), owner)))
    return c.json({ error: "Session not found." }, 404);
  const id = c.env.SESSION.idFromName(c.req.param("sessionId"));
  const forwarded = new Request(c.req.raw);
  forwarded.headers.set("X-Lockstep-Owner", owner);
  return c.env.SESSION.get(id).fetch(forwarded);
});

app.get("/api/sessions/:id", async (c) => {
  c.header("Cache-Control", "no-store");
  const sessions = new SessionRepository(c.env.DB);
  await sessions.ensureSchema();
  const owner = await investigationOwner(c.req.header("Authorization") ?? null);
  if (!owner) return c.json({ error: "Private browser access key required." }, 401);
  if (!(await sessions.hasOwner(c.req.param("id"), owner)))
    return c.json({ error: "not found" }, 404);
  const session = await sessions.findById(c.req.param("id"));
  if (session === null) {
    return c.json({ error: "not found" }, 404);
  }
  return c.json(session);
});

app.onError((_error, c) =>
  c.json({ error: "The request could not be completed.", code: "internal_error" }, 500),
);

export { ReviewSession };
export default app;
