# Sidekick refactor verification

These checks were executed locally on November 2, 2026. They do not establish that
a live provider or cloud deployment works with the owner's accounts.

## Current implementation

The report-oriented frontend was replaced with an original conversation workspace.
All failure categories now use an actual LangGraph StateGraph and LangChain retrieval
and prompt components. The Rust/WASM SQL analyzer remains a conditional specialist.
Threads, messages, uploaded/pasted context, context selection, and legacy report
migration use owner-scoped D1 persistence. Model answer text streams provisionally;
only the validated final answer and report become authoritative saved output.

## Executed checks

Commands use `pnpm` for portability; Windows execution used `pnpm.cmd` without changing
PowerShell's execution policy.

| Check                                            | Result                                                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                 | Passed after removing unused SQL-editor dependencies                                                           |
| `pnpm format:check`                              | Passed with the final formatted sources                                                                        |
| `pnpm build`                                     | Next.js production build passed for all app routes                                                             |
| Worker `wrangler deploy --dry-run`               | Backend bundle passed; no remote deployment                                                                    |
| `pnpm release:audit`                             | Secret scan and 37 initial plus three sidekick commit metadata checks passed                                   |
| `pnpm lint`                                      | Passed across the complete application and tests                                                               |
| `pnpm typecheck`                                 | All three workspace package checks passed                                                                      |
| `pnpm test`                                      | Complete retained worker suite, new graph/knowledge/thread/provider API suites, and nine frontend tests passed |
| `pnpm test:e2e`                                  | 21 Chromium workflows passed in 58.1 seconds after the final cancellation and CSS namespace changes            |
| `pnpm eval:investigations`                       | All 20 labeled case expectations passed                                                                        |
| `pnpm eval:retrieval` with an empty provider key | Local-hash recall@3 94/100, unchanged                                                                          |
| `pnpm security:scan`                             | Reachable history, staged blobs, current source, and historical paths passed Secretlint and repository rules   |
| `pnpm audit --audit-level moderate --json`       | Zero advisories; 323 dependency entries                                                                        |

The complete application suite was rerun after the sanitized WASM rebuild, along with
all 13 Rust tests. The actual rebuilt WASM passed all 25 API fixture checks.

The normal worker test command now includes the universal graph assertion suite,
six SQLite-backed knowledge tests, eight SQLite-backed thread repository tests,
and real Wrangler knowledge, thread, and controlled-provider API tests. Shared
normalization/wire-validation tests count 33. The retained parse API also passes
all 25 SQL migration fixtures against the actual checked-in WASM binary.

A controlled local HTTP server validates real structured-output SSE, escaped Unicode,
custom model and base URL, inherited environment on follow-ups, invalid-citation
fallback, and turn-specific cancellation. This runs through the actual Wrangler
thread endpoint. It performs no external provider calls. The vector-export regression
also verifies the configured embedding endpoint/model and overwrite protection.

A production frontend was smoke-tested locally at `http://localhost:3000`, backed by
Wrangler on port 8787. `/`, `/investigate`, `/history`, `/how-it-works`, and `/sql`
all returned HTTP 200. A production-browser smoke test also completed a real
investigation and same-thread follow-up with two final reports and no client errors. Health confirmed no model key is configured, so this preview
uses deterministic guidance until the owner adds a server-side key.

## Browser and behavior review

The browser suite covers Python, JavaScript, Java, Rust, tests, HTTP, logs,
PostgreSQL/SQLite errors, and SQL migrations in the same agent. Real follow-ups retain
the thread across reloads. Private context is pasted/uploaded, pinned/unpinned,
retrieved with a unique marker, reopened, isolated from other owners, and deleted.
History opens actual saved conversations and deletion removes the correct thread.

Failure cases include malformed streams, network errors, cancellation without
resubmission, authoritative final replacement of a provisional draft, oversized
messages, invalid environment fields, and navigation away during an active request.
The last regression prevents an old request's abort handler from replacing the newly
selected thread. Server tests reject cancellation for a different active turn and
prevent a completed request replay from claiming a new turn.

Desktop (1440px), mobile (390px), and tablet (768px) layouts were checked. Actual
workspace, conversation, history, context, and SQL-mode screenshots were reviewed.
Checks include horizontal overflow, keyboard navigation, visible focus, accessible
form labels, and computed 4.5:1 contrast for key text and controls. This is targeted
accessibility testing, not a full audit.

Final review additionally found and fixed stale context pins across threads: reopening
a conversation now removes deleted or unavailable pins without losing valid ones. An
eighth SQLite regression verifies both affected threads and persisted cleanup; the real
API check sends the repaired IDs exactly as the frontend does. Cancellation captures
its request controller before releasing the database turn, so a successor cannot be
aborted by the earlier stop. The controlled-provider test confirms a subsequent turn
completes successfully.

Private vector tests reject foreign-owner and deleted matches by resolving them back
to owned D1 chunks. SQLite tests exercise atomic quotas, transaction rollback,
idempotency, expired turn leases, cancellation/late completion, and legacy migration.
Most API tests explicitly disable model credentials; the controlled-provider test
uses only its local dummy key and local endpoint. The credential-isolation fixture
checks that explicit blank test variables override an ignored `.dev.vars` file.

## Evaluation measurements

The current deterministic graph run passed parsing/validation 20/20, labeled runbook
recall 17/17, citation identifiers 198/198, diagnostic lexical expectations 18/18,
guidance expectations 18/18, and reliability expectations 20/20.

Across 18 local workflow samples, p50 was 3.784 ms and p95 was 29.201 ms. These small
process-local measurements include graph orchestration but exclude providers,
embeddings, network, D1, production scheduling, and SQL/WASM execution. They are
regression measurements, not production latency or a live AI quality score. Citation
identity is not proof of entailment. See [evaluation](../eval/README.md).

## Preserved initial release

The original repository was inspected read-only at commit
`07d578de72cdd7e0c806a134229d45ac9d71056a`. Its clean working tree was preserved. The
remastered repository was independently initialized, excluding old Git metadata,
credentials, dependencies, caches, and builds.

The published history contains 40 substantive Conventional Commits in their original
implementation order, with 20 assigned to November 1 and 20 to November 2, 2026.
Every timestamp is later than the GitHub repository's creation at November 1,
22:12:14 Toronto time (UTC-05:00), and no later than November 2, 02:00. These are
assigned release timestamps, not a measurement of development duration.

History cleanup preserves all application files, author identities, messages, and
implementation changes. Date-dependent audit rules and these notes follow the
corrected schedule. The 40 release commits have distinct file trees and nonempty
changes; no duplicate implementation commits were found. Rewritten commit IDs can
remain credited in GitHub's profile contribution cache even when they are absent
from the current branch. A profile-data rebuild is controlled by GitHub, not Git.

The initial release additionally passed 13 Rust tests, rustfmt, wasm32 checking,
a release WASM rebuild, and all 25 WASM API fixture checks. Its rebuilt binary was
SHA-256 identical to the preserved checked-in binary:
`3BE19B6DF3AA7F85BE0C6690A5629C40F044B481B4524F080A05AE345F294CBE`.
Rust analyzer source is unchanged. The sidekick release rebuilds the WASM and matching
web bindings with stripped symbols and remapped build paths, using `pnpm build:sql`.
The old binary included eight personal build-path strings. The current binary has
none. Its SHA-256 is `DCC921A3CECB7F8A9C6F550815A394248E59804799115341BD93D67F894819E9`. The already-published historical artifact still contains those noncredential
paths; append-only commits do not erase older Git objects. The scanner checks binary
ASCII/UTF-16 strings for credentials and reports historical binary build paths
separately. No API key was found in those strings.

## External limits

No paid OpenAI generation, live embedding request, Vectorize query/upsert, remote D1
provisioning, deployed Durable Object, or public frontend deployment was performed.
Provider configuration is not proof of live credentials, billing, or endpoint
compatibility. Remote GitHub Actions results are not asserted. The browser capability
has no account/SSO or cross-device sync, and partial generation is not resumable from
a LangGraph checkpoint. Context ingestion supports UTF-8 text/code, not PDFs/images.
