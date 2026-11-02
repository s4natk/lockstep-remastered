# Verification

This document records the implementation's local validation and evaluation results.
It distinguishes reproducible regression checks from production infrastructure and
live-provider behavior, which require separate deployment smoke tests.

## Recorded validation

The following checks were executed during the November 2, 2026 implementation
review. Commands use `pnpm` for portability; Windows execution used `pnpm.cmd`.

| Check                                            | Recorded result                                            |
| ------------------------------------------------ | ---------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                 | Passed with the checked-in lockfile                        |
| `pnpm lint`                                      | Passed across source and tests                             |
| `pnpm format:check`                              | Passed                                                     |
| `pnpm typecheck`                                 | All three workspace package checks passed                  |
| `pnpm test`                                      | Worker and frontend suites passed                          |
| `pnpm build`                                     | Next.js production build passed for all application routes |
| Worker `wrangler deploy --dry-run`               | Backend bundle passed without a remote deployment          |
| `pnpm test:e2e`                                  | 21 Chromium workflows passed; recorded run 58.1 seconds    |
| `pnpm test:rust`                                 | 13 Rust tests passed                                       |
| Wrangler parse API fixtures                      | All 25 labeled migrations passed against the rebuilt WASM  |
| `pnpm eval:investigations`                       | All 20 labeled case expectations passed                    |
| `pnpm eval:retrieval` with an empty provider key | Local-hash recall@3 94/100                                 |
| `pnpm security:scan`                             | Secretlint and repository privacy rules passed             |
| `pnpm audit --audit-level moderate --json`       | Zero advisories in the measured lockfile                   |

Tests include 33 normalization/wire-validation cases, six SQLite-backed knowledge
cases, eight SQLite-backed thread repository cases, nine frontend tests, and the
retained assertion and API suites. The complete application suite was rerun after
the sanitized WASM rebuild. The current SQL artifact passed the actual API fixtures,
rather than a parser mock.

A production frontend smoke check returned HTTP 200 for `/`, `/investigate`,
`/history`, `/how-it-works`, and `/sql`. A browser completed an investigation and a
follow-up against the production build with no client errors. The provider was
disabled for this check.

## Workflow and persistence coverage

Universal LangGraph tests exercise graph nodes, the conditional SQL specialist,
LangChain retrieval, conversation context, bounded inputs, and validated output.
Controlled responses cover refusals, malformed or incomplete JSON/SSE, escaped
Unicode, invalid evidence references, trusted-identity overrides, response limits,
provider failures, and cancellation.

The controlled-provider API suite starts a local HTTP server and routes actual
Wrangler requests through it. It verifies streamed text, custom model/base URL,
persisted environment details on follow-ups, citation fallback, cancellation for a
specific turn, and a successful subsequent turn. No external model request is needed.
The vector-export regression checks the configured embedding endpoint/model and
output-file overwrite protection.

SQLite-backed tests verify owner-filtered CRUD, atomic quotas, rollback, turn replay,
conversation limits, expired leases, cancellation/late completion, legacy-report
migration, and deletion. Context deletion is tested across multiple conversations:
unavailable pins are removed without losing other valid selections.

Private vector matches must resolve through existing D1 chunks owned by the same
capability. Tests reject foreign-owner and deleted matches. Most API tests explicitly
disable provider credentials; the controlled-provider suite uses only its local
endpoint and dummy credential. A separate credential-isolation test verifies that
explicit blank test variables override local provider configuration.

## Browser and accessibility coverage

The browser suite submits Python, JavaScript, Java, Rust, test, HTTP, log,
PostgreSQL/SQLite, and SQL migration examples through the same agent interface.
It covers follow-ups, history across reloads, independent browser ownership,
context paste/file upload, pinning, retrieval, and deletion.

Failure injection covers malformed streams, network errors, oversized messages,
invalid environment fields, cancellation without resubmission, and navigation while
a request is active. A validated final message must replace provisional text. An old
request's abort handler must not replace the newly selected conversation.

Desktop (1440px), mobile (390px), and tablet (768px) layouts were reviewed. Targeted
checks cover horizontal overflow, keyboard navigation, visible focus, accessible
form labels, and computed 4.5:1 contrast for key text and controls. These checks are
not a full accessibility audit or certification.

## Evaluation methodology and results

The deterministic investigation corpus separates parsing, retrieval, citation
identity, diagnostic lexical expectations, remediation/verification expectations,
and reliability:

| Dimension                                 | Recorded result |
| ----------------------------------------- | --------------: |
| Parsing and validation                    |           20/20 |
| Labeled relevant runbooks retrieved       |           17/17 |
| Citation identifiers                      |         198/198 |
| Diagnostic lexical expectations           |           18/18 |
| Remediation and verification expectations |           18/18 |
| Reliability expectations                  |           20/20 |

Across 18 local workflow samples, p50 was 3.784 ms and p95 was 29.201 ms. These small
process-local measurements include graph orchestration but exclude providers,
embeddings, network, persistence, production scheduling, and SQL/WASM execution.
They are regression measurements, not production latency or a live AI quality score.
Citation identity does not prove entailment or causality. See [evaluation](../eval/README.md)
for fixtures, commands, and limitations.

## Repository and build-artifact privacy

The repository scanner examines current source, staged blobs, reachable history,
and historical filenames. It checks text and printable ASCII/UTF-16 strings from
binary files. Local credentials, environment files, databases, caches, editor state,
and assistant configuration are excluded from version control. Public environment
templates contain variable names and non-secret defaults.

The SQL WASM build strips symbols and remaps local build roots before publishing
matching web bindings. The recorded artifact SHA-256 is:

```text
DCC921A3CECB7F8A9C6F550815A394248E59804799115341BD93D67F894819E9
```

Older published WASM versions contain noncredential build-path metadata. The current
artifact is sanitized, and the scanner reports historical binary build paths
separately. No API key was detected in those strings. A source scan cannot prove
that every possible secret is absent.

## Limits of verification

Controlled-provider and local-emulator results do not establish live provider
permissions, API credit, embedding quality, or the state of a deployed Cloudflare or
Vercel account. Follow [the deployment smoke check](deployment.md#5-verify-the-deployed-application)
after provisioning infrastructure or changing configuration.

Browser capabilities provide private ownership without account login or cross-device
sync. Clearing browser storage loses access to that capability. Partial generation
is not resumable from a LangGraph checkpoint. Context ingestion supports UTF-8 text
and code, not PDFs or images. Suggested code, SQL, and shell commands are never
executed by the application.
