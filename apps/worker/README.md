# Worker

Hono routes run in Cloudflare Workers. The main application uses persisted investigation
threads and a private knowledge library. Every failure category passes through the
universal LangGraph investigation workflow; SQL analysis remains a conditional Rust/WASM
stage within that workflow.

Run `pnpm dev:worker` from the repository root. The root README covers local setup,
provider configuration, D1 provisioning, optional Vectorize, origin restrictions,
and deployment. When deploying under another Cloudflare account, create a D1 database
and use its identifier with the existing `DB` binding.

## Investigation workflow

`investigationWorkflow.ts` compiles a typed `StateGraph` with normalization, optional
SQL hazard analysis, evidence retrieval, investigation, and report-validation nodes.
Retrieval uses a LangChain retriever and runnable sequence. Curated runbooks use keyword
retrieval with optional embedding/vector enrichment; local keyword fallback is labelled.

A thread turn combines the latest question, the relevant original failure, a bounded
recent conversation, saved environment details, and owner-scoped context evidence.
Pinned documents enter the bounded turn context. Other documents in that owner's
knowledge library can be retrieved when relevant. Unpinning does not delete a source
or exclude it from future retrieval.

The model receives untrusted evidence as data. Submitted code, SQL, and shell commands
are never executed. The workflow validates report structure and citation identifiers.
A valid identifier establishes source identity, not entailment or a proven root cause.
Missing credentials, provider failures, and invalid model output produce clearly labelled
deterministic guidance where a safe fallback is available.

## Thread and knowledge API

These routes require `Authorization: Bearer <browser capability>`. The browser generates
and retains this random capability; it is separate from server-side model credentials.
The server hashes the capability for ownership checks. Reads and mutations are scoped
to that owner, with no public list of investigations or documents.

| Method and route                 | Behavior                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| GET `/health`                    | Backend/provider configuration state; no secrets or live-provider health guarantee       |
| POST `/api/threads`              | Create an empty thread; JSON body `{}`; return the complete thread                       |
| GET `/api/threads`               | Return `{ threads }`, including owned legacy investigations imported into thread history |
| GET `/api/threads/:id`           | Return the owned thread and saved messages                                               |
| DELETE `/api/threads/:id`        | Delete the owned thread and stop its active request where possible                       |
| PATCH `/api/threads/:id/context` | Persist pinned `contextIds`; reject unavailable sources and busy threads                 |
| POST `/api/threads/:id/messages` | Submit an investigation turn; SSE when requested, otherwise `{ message }`                |
| POST `/api/threads/:id/cancel`   | Cancel the active turn; an optional `clientTurnId` restricts cancellation to that turn   |
| POST `/api/knowledge`            | Save and chunk a private document, code excerpt, log, or note; return its summary        |
| GET `/api/knowledge`             | Return `{ documents }` for the current owner                                             |
| GET `/api/knowledge/:id`         | Return a saved document, including its content                                           |
| DELETE `/api/knowledge/:id`      | Delete the owned document/chunks and remove its vectors when configured                  |

Turn input uses schema version 1:

```json
{
  "schemaVersion": 1,
  "message": "TypeError: Cannot read properties of undefined (reading 'email')",
  "clientTurnId": "8f88aa5c-9aee-4dca-bb45-35611e211008",
  "contextIds": []
}
```

`requestedKind` and `environment` are optional. Messages are bounded to 32,768
characters, JSON payloads to 65,536 bytes, and pinned source IDs to 12. Knowledge input
is `{ schemaVersion: 1, title, content, kind }`, where `kind` is `document`, `code`,
`log`, or `note`. Content is bounded to 32,768 characters. The frontend additionally
bounds uploaded UTF-8 files to 32 KB and rejects binary formats.

Knowledge remains usable through keyword retrieval without embeddings or Vectorize.
Summaries expose the actual `indexStatus`; a keyword index is not represented as
semantic search. Vector results are checked against owner-scoped D1 records before
source content enters a turn.

## Streaming and recovery

Send `Accept: text/event-stream` to the thread message endpoint. Each SSE `data` value
is a validated JSON event:

| Event     | Meaning                                                                        |
| --------- | ------------------------------------------------------------------------------ |
| `thread`  | Current thread summary                                                         |
| `stage`   | An actual workflow stage, with thread/turn identity and progress metadata      |
| `delta`   | Provisional answer text with `provisional: true`                               |
| `message` | Authoritative assistant message, including its validated report when available |
| `done`    | Completion for the identified thread and turn                                  |
| `error`   | A safe failure code and message                                                |

Streaming text is provisional. The frontend replaces it with the authoritative final
message; it does not append the final response to the draft or retain unsupported
partial output after a failed validation. A fallback final response can differ from
what the model streamed. The final message is persisted before emission.

Only one turn can run in a thread at a time. `clientTurnId` makes a completed turn
replayable without repeating model work; reusing it with changed input is a conflict.
Disconnected clients can reload the saved thread. Cancellation invalidates the active
turn so a late provider response cannot overwrite its cancelled state. A bounded lease
also makes abandoned work recoverable. The frontend does not automatically resend an
interrupted message.

D1 stores thread messages, per-turn input options, pinned source IDs, validated reports,
and knowledge content/chunks. Browser storage retains the access key; clearing it loses
access to those records. Trace records contain stage names and durations without raw
submissions, credentials, or provider response bodies.

## Compatible investigation and SQL endpoints

The earlier API remains available even though the primary UI now uses threads:

| Method and route                 | Behavior                                            |
| -------------------------------- | --------------------------------------------------- |
| POST `/api/investigations`       | One-shot validated investigation; JSON or SSE       |
| GET `/api/investigations`        | Owned one-shot history                              |
| GET `/api/investigations/:id`    | Complete report or an incomplete/not-found response |
| DELETE `/api/investigations/:id` | Delete an owned one-shot report                     |
| POST `/api/parse`                | Stateless bounded Rust/WASM SQL classification      |
| GET `/api/sessions/:id`          | Capability-authorized specialized SQL review        |
| GET `/agent/connect/:sessionId`  | Owned `ReviewSession` Durable Object WebSocket      |

The one-shot SSE contract remains `stage`, `report`, `done`, and `error`. SQL WebSockets
retain their existing protocol. Clients offer `lockstep` and
`capability.<browser capability>` subprotocols; the server negotiates only `lockstep`.
Capabilities are never put in request URLs. Origin restrictions apply.

D1 migrations describe investigations, SQL session ownership, knowledge, and sidekick
threads. Runtime schema initialization supports fresh local databases. Admission limits
bound investigations and context ingestion; public parsing also enforces input bounds.
Neither local builds nor local Wrangler tests establish a successful cloud deployment.

## Verification

`pnpm test`, `pnpm test:e2e`, and the evaluation commands are described in the root
README and `eval/README.md`. Worker tests cover parser and SQL regressions, retrieval,
provider failures, citation validation, the universal graph, private knowledge,
thread persistence/replay/cancellation, owner isolation, and compatible legacy APIs.
Controlled provider tests exercise provisional streaming and authoritative replacement
without relying on live model credentials. Browser tests use the actual local frontend
and Worker for primary flows, with explicit failure injection for network and malformed
response cases.
