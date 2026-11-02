# Lockstep

**Postgres migration review agent on Cloudflare Workers** — Rust classifies dangerous DDL, hybrid RAG retrieves runbooks, and a LangGraph draft streams a citation-grounded rollout note.

A full-stack edge application that reviews SQL migrations using **WebAssembly-accelerated parsing**, **retrieval-augmented generation (RAG)**, **LangGraph orchestration**, and **real-time WebSocket streaming** — with OpenTelemetry span summaries and session persistence on Cloudflare D1. Frontend on Vercel; compute and agent state on Cloudflare’s global edge.

**[Live demo](https://lockstep-eta.vercel.app/)** · **[API / Worker](https://lockstep.mrkanwalsanat.workers.dev/health)**

---

## Project overview

Lockstep demonstrates a modern **edge-native agent** for database migrations:

- **Parses migrations** with a **Rust → WebAssembly** module (`sqlparser`, Postgres dialect). Hazard labels (`data_loss`, `lock_risk`, `rewrite`) come from the parser, not the LLM.
- **Retrieves runbooks** with **hybrid search**: keyword rank + embedding cosine similarity, fused with **reciprocal rank fusion (RRF)**. Uses **Cloudflare Vectorize** when bound; falls back to in-memory scoring locally or when Vectorize is unavailable.
- **Drafts rollout notes** with **LangGraph** and LangChain `ChatPromptTemplate`. **OpenAI `gpt-4.1-mini`** streams when `OPENAI_API_KEY` is set; otherwise a mock model quotes parser and runbook text for demos.
- **Grounds every sentence** with a **citation checker** — uncited lines are dropped. Sources: parser reasons, retrieved runbooks, or optional user context from the sidebar.
- **Routes chat vs review** — casual messages (e.g. “hi”) get a scoped assistant reply; DDL/SQL triggers the full review pipeline.
- **Streams tokens** over a **WebSocket** on a **Durable Object** (`ReviewSession`), then persists the session in **D1**.
- **Traces** `wasm.parse`, `retrieval.hybrid`, `retrieval.embed` / `retrieval.vectorize`, and `review.draft` with **OpenTelemetry**-style span summaries in the UI.
- **Serves a Next.js chat UI** (React, TypeScript, custom CSS) with an optional **context rail** (localStorage) that is sent with each SQL review.

**Key achievement:** **94/100 recall@3** on 100 bundled runbook eval questions with the local-hash embedder (`pnpm eval:retrieval`); **25** labeled migration fixtures validated by `cargo test` for the Wasm parser — no always-on servers, only Workers + Durable Objects at the edge.

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                     Next.js Frontend (Vercel)                   │
│   • WebSocket client for streaming reviews and chat             │
│   • Context rail (browser localStorage)                         │
│   • Example migrations and rollout-note details                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │  WebSocket / HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Cloudflare Worker (Hono)                         │
│                                                                 │
│   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐     │
│   │ ReviewSession │   │  Rust WASM    │   │ Vector search │     │
│   │ Durable Object│   │  sql_guard    │   │ Vectorize or  │     │
│   │               │   │               │   │ in-memory     │     │
│   │ • WebSocket   │   │ • DDL split   │   │ • Embeddings  │     │
│   │ • Streaming   │   │ • Hazard tags │   │ • Keyword RRF │     │
│   │ • D1 save     │   │               │   │               │     │
│   └───────┬───────┘   └───────────────┘   └───────┬───────┘     │
│           │                                       │             │
│           │           ┌───────────────┐           │             │
│           └──────────>│   LangGraph   │<──────────┘             │
│                       │ parse → search│                         │
│                       │ → draft       │                         │
│                       │ citation check│                         │
│                       └───────┬───────┘                         │
│                               │                                 │
│                               ▼                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ OpenAI API (when OPENAI_API_KEY is set on the Worker)   │   │
│   │ • gpt-4.1-mini streaming (draft + chat assistant)       │   │
│   │ • text-embedding-3-small (64-dim for retrieval)         │   │
│   └─────────────────────────┬───────────────────────────────┘   │
│                             ▼                                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ D1: sessions (sql, parse JSON, note, citations, trace)  │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech stack

### Backend (Cloudflare Workers)

| Area | Choice |
| --- | --- |
| Runtime | Cloudflare Workers (V8 isolates) |
| Router | Hono |
| Stateful agent | Durable Objects (`ReviewSession`) |
| Database | Cloudflare D1 |
| Vector DB | Cloudflare Vectorize (optional; in-memory fallback) |
| AI | OpenAI API (`gpt-4.1-mini`, embeddings) |
| Agent graph | LangGraph + LangChain prompts |
| WASM | Rust (`packages/sql_guard`), `wasm-pack --target web` |

### Frontend (Next.js)

| Area | Choice |
| --- | --- |
| Framework | Next.js App Router, React 19, TypeScript |
| UI | Custom global CSS (no Tailwind) |
| Deploy | [Vercel](https://lockstep-eta.vercel.app/) |
| Config | `NEXT_PUBLIC_WORKER_URL` → Worker origin |

### Observability and tests

- OpenTelemetry span names/durations on parse, retrieval, and draft
- Worker tests: health, parse API, WebSocket review + chat, hybrid search, citation check, review graph
- Parser: `cargo test` on 25 SQL fixtures
- CI: typecheck + worker tests (GitHub Actions)

### Tooling

- pnpm workspaces, `@lockstep/shared` types
- Wrangler CLI, GitHub Action for PR parser comments (`action.yml`)

---

## Live demo

| | URL |
| --- | --- |
| **Frontend** | [https://lockstep-eta.vercel.app/](https://lockstep-eta.vercel.app/) |
| **Worker API** | [https://lockstep.mrkanwalsanat.workers.dev/health](https://lockstep.mrkanwalsanat.workers.dev/health) |
| **Health check** | [https://lockstep.mrkanwalsanat.workers.dev/health](https://lockstep.mrkanwalsanat.workers.dev/health) |

If the UI shows **“worker offline”**, set `NEXT_PUBLIC_WORKER_URL=https://lockstep.mrkanwalsanat.workers.dev` in Vercel (Production), then **redeploy** the web app so the build picks up the variable.

### How to find your Worker URL after deploy

From `apps/worker`:

```bash
pnpm exec wrangler deploy
```

Wrangler prints a line like:

```text
https://lockstep.<your-subdomain>.workers.dev
```

That origin (no trailing slash) is your **API endpoint** and the value for `NEXT_PUBLIC_WORKER_URL`.

### Test cases to try

#### 1. Say hi (chat mode)

In the composer, send:

```text
hi
```

**Expected:** A short greeting explaining that Lockstep reviews Postgres migrations and can answer DDL questions or review pasted SQL.

#### 2. Drop a table (review mode)

```sql
DROP TABLE sessions;
```

**Expected:** Streaming rollout note quoting `DROP TABLE deletes the table and its rows.` Details show hazard `data_loss`, citations (`statement:0`, `drop-table` runbook), and trace spans (`wasm.parse`, retrieval, `review.draft`).

#### 3. Rewrite risk

```sql
ALTER TABLE users ALTER COLUMN age TYPE bigint;
```

**Expected:** Hazard `rewrite`; retrieval favors the `alter-type` runbook.

#### 4. Add sidebar context

In **Extra context**, save: `Require a backup before dropping production tables.` Then run the `DROP TABLE` example again.

**Expected:** Context appears in the prompt as `context-0` and can show up in the note with a `context` citation.

#### 5. REST parser (no LLM)

```bash
curl -s https://lockstep.mrkanwalsanat.workers.dev/api/parse \
  -H "content-type: application/json" \
  -d "{\"sql\":\"DROP TABLE sessions\"}"
```

**Expected:** JSON with `data_loss` hazard and parser reason string.

---

## Development phases

| Phase | Objective | Key deliverables |
| --- | --- | --- |
| 0 — Bootstrap | Monorepo | pnpm workspaces, shared types, Worker + Next.js shells, CI typecheck |
| 1 — Parser | Wasm DDL classifier | Rust `sql_guard`, hazard labels, 25 fixtures |
| 2 — Data plane | Edge persistence | D1 schema, sessions, `POST /api/parse`, CORS |
| 3 — RAG + agent | Grounded drafts | 15 runbooks, hybrid search, citation check, LangGraph, streaming |
| 4 — Product | Real-time UX | Durable Object WebSocket, Next.js chat UI, context rail, GitHub Action |
| 5 — Deploy | Public demo | Worker on Cloudflare, web on Vercel, OpenAI secret on Worker |

---

## Features

- Real-time token streaming over WebSocket (reviews and chat)
- Persistent review sessions in D1; `GET /api/sessions/:id`
- Hybrid runbook retrieval (keyword + vectors + RRF)
- Rust Wasm Postgres DDL classification
- Citation gate — drops hallucinated sentences
- Optional user context on SQL reviews
- OpenTelemetry-style span footer on completed reviews
- Mock/demo mode without OpenAI (local embedder + mock drafter)
- Mobile-friendly layout with collapsible context sidebar
- PR helper: GitHub Action posts parser JSON via `/api/parse`

---

## Installation and deployment

### Prerequisites

- Node.js ≥ 20, pnpm 11
- Cloudflare account (D1, Durable Objects; Vectorize optional)
- OpenAI API key (recommended for live chat + drafts on the Worker)
- Rust + `wasm-pack` only if you change `packages/sql_guard`

### Quick start (live site)

No install required: **[https://lockstep-eta.vercel.app/](https://lockstep-eta.vercel.app/)**

### Local development

```bash
git clone https://github.com/s4natk/lockstep.git
cd lockstep
pnpm install
pnpm dev:worker   # http://localhost:8787
pnpm dev:web      # http://localhost:3000
```

Optional: `apps/web/.env.local` with `NEXT_PUBLIC_WORKER_URL=http://localhost:8787`.

Local OpenAI: `apps/worker/.dev.vars` with `OPENAI_API_KEY=sk-...` (do not commit), or `pnpm exec wrangler secret put OPENAI_API_KEY` for remote.

### Deploy your own instance

1. **D1:** `pnpm exec wrangler d1 create lockstep` → set `database_id` in `apps/worker/wrangler.toml` → `pnpm exec wrangler d1 execute lockstep --remote --file=schema.sql`
2. **Secret:** `cd apps/worker && pnpm exec wrangler secret put OPENAI_API_KEY`
3. **Worker:** `pnpm exec wrangler deploy` → copy the `workers.dev` URL
4. **Vercel:** Root directory `apps/web`, env `NEXT_PUBLIC_WORKER_URL=https://lockstep.<subdomain>.workers.dev`, redeploy after any env change
5. **CORS (optional):** Add your Vercel origin to `apps/worker/src/index.ts` if the browser should call `/health` or `/api/parse` from production

---

## API reference

### `GET /health`

```json
{
  "ok": true,
  "timestamp": "2026-10-10T21:11:12.908Z",
  "openai": {
    "configured": true,
    "chatModel": "gpt-4.1-mini",
    "mode": "live"
  }
}
```

`mode` is `mock` when `OPENAI_API_KEY` is not set on the Worker.

### `POST /api/parse`

Request:

```json
{"sql": "DROP TABLE sessions"}
```

Response: `ParseResult` with `statements` and `hazards` (see `packages/shared`).

### `GET /api/sessions/:id`

Returns stored session row or `404`.

### WebSocket `WS /agent/connect/:sessionId`

**Client → server** (chat or SQL in one field):

```json
{
  "type": "message",
  "text": "DROP TABLE sessions;",
  "context": ["Require a backup before this drop."]
}
```

Legacy shape still works: `{ "type": "review", "sql": "..." }`.

**Server → client** (review path):

```json
{"type": "intent", "intent": "review", "sessionId": "..."}
{"type": "parse", "sessionId": "...", "result": {}}
{"type": "token", "content": "..."}
{"type": "done", "sessionId": "...", "intent": "review", "note": "...", "citations": [], "dropped": [], "trace": {"spans": []}}
```

**Server → client** (chat path):

```json
{"type": "intent", "intent": "chat", "sessionId": "..."}
{"type": "token", "content": "Hi! "}
{"type": "done", "sessionId": "...", "intent": "chat", "reply": "..."}
```

Errors: `{ "type": "error", "error": "..." }`.

---

## Project structure

```text
lockstep/
├── apps/
│   ├── worker/                 # Hono, Durable Object, LangGraph, D1
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── reviewSession.ts
│   │   │   ├── reviewGraph.ts
│   │   │   ├── assistantChat.ts
│   │   │   ├── hybridSearch.ts
│   │   │   ├── citationCheck.ts
│   │   │   ├── parser.ts
│   │   │   └── ...
│   │   ├── schema.sql
│   │   └── wrangler.toml
│   └── web/                    # Next.js chat UI
│       └── src/
│           ├── app/
│           ├── components/
│           └── lib/
├── packages/
│   ├── sql_guard/              # Rust DDL → Wasm
│   └── shared/                 # Hazards, citations, runbooks
├── eval/
│   ├── migrations/             # 25 labeled SQL fixtures
│   └── runbooks/               # 15 chunks + questions.json
├── action.yml                  # PR comment from POST /api/parse
└── pnpm-workspace.yaml
```

---

## Technical highlights

### Durable Objects for streaming reviews

`ReviewSession` holds the WebSocket, emits parser JSON before tokens, runs LangGraph, and writes the finished note to D1.

### Rust Wasm parser

Statement splitting, byte spans, and hazard codes without round-trips to a parser service.

### Hybrid RAG at the edge

Keyword search over bundled chunks plus embedding similarity; RRF merge; Vectorize when available.

### Citation enforcement

Sentences must include a quote grounded in parser output, a retrieved chunk, or user context — reducing unsafe rollout advice.

### SSE → WebSocket bridge

OpenAI streaming chat completions are parsed line-by-line and re-emitted as WebSocket `token` events.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Troubleshooting

| Issue | Fix |
| --- | --- |
| **Worker offline on Vercel** | Set `NEXT_PUBLIC_WORKER_URL` to your `https://…workers.dev` URL and redeploy `apps/web`. |
| **WebSocket failed** | Worker must be deployed; URL must use `https` (browser uses `wss`). |
| **Demo mode / mock replies** | Run `/health`; if `openai.configured` is false, set `wrangler secret put OPENAI_API_KEY` and redeploy. |
| **Vectorize warnings locally** | Expected in `wrangler dev`; hybrid search falls back to in-memory vectors. |
| **D1 table missing** | `wrangler d1 execute lockstep --remote --file=schema.sql` |
| **Wasm errors** | Rebuild: `cd packages/sql_guard && wasm-pack build --target web --release` |

**Local fallback:** `pnpm dev:worker` + `pnpm dev:web` → [http://localhost:3000](http://localhost:3000).
