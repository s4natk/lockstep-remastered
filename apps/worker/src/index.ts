import { Hono } from "hono";
import { cors } from "hono/cors";

import type { Env } from "./env.js";
import { allowedOrigins } from "./origins.js";
import { parseMigration, MigrationParseError } from "./parser.js";
import { ReviewSession } from "./reviewSession.js";
import { SessionRepository } from "./sessionRepository.js";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: (origin, c) => (allowedOrigins(c.env.ALLOWED_ORIGINS).includes(origin) ? origin : null),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
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
      chatModel: "gpt-4.1-mini",
      mode: configured ? "live" : "mock",
    },
  };
}

app.get("/", (c) => c.json(healthBody(c.env)));
app.get("/health", (c) => c.json(healthBody(c.env)));

app.post("/api/parse", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be JSON." }, 400);
  }

  const sql =
    typeof body === "object" &&
    body !== null &&
    "sql" in body &&
    typeof body.sql === "string"
      ? body.sql
      : "";
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

app.get("/agent/connect/:sessionId", (c) => {
  const id = c.env.SESSION.idFromName(c.req.param("sessionId"));
  return c.env.SESSION.get(id).fetch(c.req.raw);
});

app.get("/api/sessions/:id", async (c) => {
  const sessions = new SessionRepository(c.env.DB);
  await sessions.ensureSchema();
  const session = await sessions.findById(c.req.param("id"));
  if (session === null) {
    return c.json({ error: "not found" }, 404);
  }
  return c.json(session);
});

export { ReviewSession };
export default app;
