# Release verification

These results were obtained locally during the remastered implementation. They do
not assert that a remote deployment or live provider integration has been tested.

## Baseline

The original repository was inspected read-only at commit
`07d578de72cdd7e0c806a134229d45ac9d71056a`. Its working tree was clean before copying
and remained clean afterward. The new repository was initialized independently;
old Git metadata, dependencies, credentials, caches, and builds were excluded.

Baseline locked install, all workspace type checks, existing worker regression tests,
production frontend build, and 13 Rust tests passed. The existing frontend test command
ran zero tests. The original repository did not provide lint or formatter checks.
The retained retrieval evaluation measured recall@3 94/100 with the local hash embedder.

New linting identified two inherited unused assignments, and rustfmt identified
inherited formatting deviations. These were corrected. Dependency audits identified
inherited production and development advisories; patched versions are locked and the
complete final audit reports zero findings. PowerShell script-policy restrictions
were handled by invoking `pnpm.cmd`, without changing machine execution policy.

## Executed checks

Commands below use `pnpm` for portability; the Windows execution used `pnpm.cmd`.

| Command or check                                                                                     | Actual result                                                           |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                     | Passed with the final lockfile                                          |
| `pnpm peers check`                                                                                   | No peer dependency issues                                               |
| `pnpm lint`                                                                                          | Passed                                                                  |
| `pnpm format:check`                                                                                  | Passed                                                                  |
| `pnpm typecheck`                                                                                     | All three package checks passed                                         |
| `pnpm test`                                                                                          | Complete final worker and frontend suites passed                        |
| `pnpm build`                                                                                         | Next.js production build passed for all application routes              |
| `pnpm test:e2e`                                                                                      | 17 Chromium workflows passed; final run 46.9 seconds                    |
| `cargo fmt --all --check --manifest-path packages/sql_guard/Cargo.toml`                              | Passed after formatting                                                 |
| `cargo test --locked --manifest-path packages/sql_guard/Cargo.toml`                                  | 13 tests passed, including 25 SQL fixtures                              |
| `cargo check --locked --target wasm32-unknown-unknown --manifest-path packages/sql_guard/Cargo.toml` | Passed                                                                  |
| `wasm-pack build packages/sql_guard --target web --release --out-dir ../../.git/wasm-check`          | Passed                                                                  |
| `pnpm eval:retrieval`                                                                                | Local-hash recall@3 94/100, unchanged from measured baseline            |
| `pnpm eval:investigations`                                                                           | All 20 labeled case expectations passed                                 |
| `pnpm audit --audit-level moderate --json`                                                           | Zero production or development advisories                               |
| `node scripts/audit-repository.mjs --historical`                                                     | Secretlint and all historical metadata checks passed before publication |
| `pnpm --filter @lockstep/worker exec wrangler deploy --dry-run --outdir .wrangler/dry-run`           | Passed; no deployment performed                                         |

The rebuilt web-target WASM binary was SHA-256 identical to the preserved checked-in
binary. The worker parse API also passed all 25 labeled SQL fixtures against that
actual binary, rather than a parser mock.

A production `next start` process was launched on localhost port 3100. `/`,
`/investigate`, `/history`, `/how-it-works`, and `/sql` all returned HTTP 200. The process
was stopped after the smoke test.

## Behavior and browser review

The final test suite includes 29 counted normalization and wire-validation tests and
nine frontend transport/component tests, in addition to the retained and new worker
assertion suites. Real local Wrangler integration exercises D1, Durable Objects,
WebSockets, history, deletion, authorization, SQL parsing, and rate limits. Controlled
provider responses exercise refusals, bad JSON, unsupported citations, trusted-identity
overrides, response limits, unavailable retrieval, cancellation, and provider failures.

All four integration-test Worker startups explicitly override the provider key to
empty. A temporary dummy-secret fixture proves both API overrides and CLI blank vars
win over `.dev.vars`. Playwright also starts its own Worker with an empty provider
key, rather than reusing a potentially credentialed backend.

The 17 browser tests cover Python, JavaScript, Java, Rust, test failures, HTTP errors,
application logs, PostgreSQL errors, and SQL migrations. They also cover history across
reloads, independent browser ownership, deletion, empty/oversized/environment input,
network failures, unavailable sessions, malformed streams, slow-response cancellation,
and the retained authenticated SQL WebSocket review.

Desktop (1440 pixels), mobile (390 pixels), and tablet (768 pixels) layouts were checked.
Actual landing, intake, report, history, and SQL screenshots were reviewed. Tests check
horizontal overflow, keyboard skip navigation, visible focus, accessible form labels,
and computed contrast of at least 4.5:1 for key body text, action text, input labels,
and editor text. This is targeted accessibility testing, not a full certification.

Browser testing found and resolved a shared-module bundling failure that type checking
alone did not detect. It also exposed a cancellation button being reused as a submit
button, causing an unintended new request. The final regression confirms exactly one
request and a stable cancelled state with editable input.

Review additionally corrected nullable history modes, malformed JSON report guards,
Unicode SQL offsets, maximum-length SQL evidence, structured-log classification,
private SSE cache headers, and untrusted model identity overrides. No discovered
product regression remains knowingly unresolved.

## Evaluation

The final 20-case run measured parsing/validation 20/20, relevant runbook recall 17/17,
citation identifiers 198/198, diagnostic lexical expectations 18/18, guidance
expectations 18/18, and reliability expectations 20/20.

Across 18 local deterministic workflow samples, p50 was 0.261 ms and p95 was 9.929 ms.
These measurements exclude provider, network, persistence, production scheduling,
and SQL/WASM execution. They do not measure live AI usefulness. See the evaluation
README for methodology and limitations.

## History and security

The initial release uses 37 substantive Conventional Commits. The requested historical
metadata is assigned across October 30 (12), October 31 (13), and November 1 (12), 2026.
Both date fields use Toronto's UTC-04:00 offset on the first two dates and UTC-05:00 on
November 1. Assigned metadata is not a measurement of elapsed development time.
`pnpm release:audit` validates the complete initial history, unique chronological
timestamps, local 10:00–22:00 windows, nonempty commits, and subject format.

Secretlint and repository rules inspect every reachable history text blob, historical
filenames, staged blobs, and current source files. Environment files, credentials,
private keys, dependencies, generated output, and unnecessary assistant artifacts are
ignored or rejected. Only empty/placeholder environment templates are included.
Scanning did not identify exposed credentials; pattern scans cannot prove absence of
every possible secret.

## External limitations

No live OpenAI generation, live embedding call, Vectorize query/upsert, cloud D1
provisioning, deployed Durable Object, or production frontend deployment was performed.
Model/provider behavior is validated through controlled responses and explicit offline
fallback. Remote GitHub Actions results are not asserted here; local equivalent checks
passed. Capability-based history is browser-specific and has no account/SSO workflow.
Interrupted generation is retried as a new investigation rather than resumed in place.
