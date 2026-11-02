# Worker

Hono routes run in Cloudflare Workers. New investigations use bounded deterministic
parsing, bundled runbooks, optional OpenAI/Vectorize, strict report validation, and
owner-scoped D1 persistence. The SQL workspace retains LangGraph and the ReviewSession
Durable Object with authenticated WebSockets.

Run `pnpm dev:worker` from the repository root. See the root README for environment,
D1 provisioning, optional vector indexing, origin restrictions, and deployment.
The checked-in D1 identifier is a placeholder for a new database; it does not target
the original application's resources.

## API

| Method and route                 | Behavior                                                    |
| -------------------------------- | ----------------------------------------------------------- |
| GET `/health`                    | Provider configuration state; no secrets                    |
| POST `/api/investigations`       | Validated investigation; JSON or SSE when requested         |
| GET `/api/investigations`        | Current capability's history, maximum 100                   |
| GET `/api/investigations/:id`    | Complete report or actionable incomplete/not-found response |
| DELETE `/api/investigations/:id` | Delete only the current capability's report                 |
| POST `/api/parse`                | Stateless bounded Rust/WASM SQL classification              |
| GET `/api/sessions/:id`          | Capability-authorized specialized SQL review                |
| GET `/agent/connect/:sessionId`  | Owned SQL Durable Object WebSocket                          |

Investigation and saved SQL routes require `Authorization: Bearer <browser capability>`.
The browser generates and retains the capability; these are not provider API keys.
WebSockets offer `lockstep` and `capability.<browser capability>` subprotocols and negotiate
only `lockstep`. The token is never placed in the request URL. Origin checks apply.

SSE uses JSON `data` events: `stage`, `report`, `done`, or `error`. Stage events correspond
to actual execution. A report is persisted before it is emitted. Disconnects abort
provider work where possible and mark unfinished runs cancelled; clients recover
completed reports from History instead of replaying a partial response.

D1 migration files describe investigations, quota buckets, and SQL session ownership.
Runtime schema initialization also supports a fresh local database. Only report
evidence is persisted for generalized failures, not an additional raw-input copy.
Trace records contain names and durations without inputs, credential values, or
provider response bodies.

The global admission limit is 60 investigations per minute and the per-capability
limit is 10. Both the generalized endpoint and specialized SQL messages use admission
limits. Public stateless parsing still enforces payload and input bounds.

Tests use actual local Wrangler bindings and controlled provider responses. They do
not perform cloud deployment or require live provider credentials.
