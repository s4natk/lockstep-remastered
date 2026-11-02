# @lockstep/worker

## Local dev

From the repo root:

```text
pnpm --filter @lockstep/worker dev
```

Wrangler serves the Worker at `http://localhost:8787`. The Next.js app on port 3000 is allowed to call it.

## Local D1

`database_id` in `wrangler.toml` is a placeholder. Local commands do not need a Cloudflare account.

```text
pnpm --filter @lockstep/worker exec wrangler d1 execute lockstep --local --file=schema.sql
```

That applies `schema.sql` to the local SQLite database. Replace `database_id` with the id from `wrangler d1 create lockstep` when you deploy. Vectorize and a paid Workers plan are not required to run `/health` and `/api/parse` locally.

## Vectorize

Hybrid search uses the `VECTORIZE` binding when it is present and a local cosine index otherwise. Leave the binding out for local dev. Add it after creating a 64-dimension cosine index:

```toml
[[vectorize]]
binding = "VECTORIZE"
index_name = "lockstep-runbooks"
```

Without `OPENAI_API_KEY`, embeddings are a deterministic local hash, not an OpenAI call.

## Parse

```text
curl -s http://localhost:8787/api/parse -H "content-type: application/json" -d "{\"sql\":\"DROP TABLE sessions\"}"
```

A blank `sql` field, a non-JSON body, or SQL the parser rejects returns `400` and `{ "error": "..." }`.

## Review session

Connect a WebSocket to `/agent/connect/:sessionId` and send `{ "type": "review", "sql": "..." }`. The socket sends the parser JSON first, then `{ "type": "token" }` messages, then `{ "type": "done" }` with the checked note. The Durable Object writes that review to D1. `GET /api/sessions/:id` reads it back.

## Tests

```text
pnpm --filter @lockstep/worker test
```

Retrieval recall is printed by `pnpm --filter @lockstep/worker eval:retrieval`. The line says `local-hash` or `openai` so the number is tied to the embedder that ran. It is not copied into this file ahead of a run.
