# Evaluation

Evaluation separates parsing, retrieval, citation identity, diagnostic expectations,
actionability, reliability, and timing. It does not collapse them into an unsupported
numerical confidence score or claim to measure live AI quality.

## Deterministic investigations

```sh
pnpm eval:investigations
```

`investigations/cases.json` contains labelled failures with expected categories,
deterministic finding codes, relevant runbook IDs, acceptable explanation terms,
unsupported conclusions, and expected remediation/verification guidance. Cases can
explicitly request normalization-only checks or expected validation rejection.

The runner calls the universal LangGraph investigation workflow with model credentials
disabled and the bundled keyword corpus. It checks observations against fixture labels
and validates citation IDs against actual evidence. Diagnostic and actionability checks
use explicit lexical expectations; they are regression checks, not an expert diagnosis
rubric. Reliability checks that expected rejection succeeds or that a complete validated
report is returned. Failures produce a nonzero exit code.

SQL normalization-only cases do not stand in for executing the Rust/WASM analyzer.
Thread memory, private knowledge retrieval, streaming replacement, and persistence are
verified separately by integration and browser tests rather than inferred from this
one-shot corpus.

### Current sidekick run

On November 2, 2026, the universal graph reproduced all fixture counts below:
parsing 20/20, runbook recall 17/17, citations 198/198, diagnostic expectations 18/18,
guidance 18/18, and reliability 20/20. Across 18 process-local samples, p50 was
3.784 ms and p95 was 29.201 ms. These timings include graph orchestration and exclude
provider, embedding, network, persistence, production scheduling, and SQL/WASM work.
They do not measure production latency or live AI usefulness. The local-hash SQL
retrieval evaluation again measured recall@3 of 94/100.

### Initial refactor baseline

The following measurements were recorded before the conversational sidekick update.
They are historical baseline values, not the current run's results:

| Dimension                                 | Initial baseline |
| ----------------------------------------- | ---------------: |
| Parsing and validation                    |          20 / 20 |
| Labelled relevant runbooks retrieved      |          17 / 17 |
| Citation identifiers                      |        198 / 198 |
| Diagnostic lexical expectations           |          18 / 18 |
| Remediation and verification expectations |          18 / 18 |
| Reliability expectations                  |          20 / 20 |

That initial run measured p50 0.261 ms and p95 9.929 ms across 18 local deterministic
workflow samples. It excluded model calls, embeddings, network, persistence, production
scheduling, and SQL/WASM execution. These values are not production latency, an SLA,
or a performance comparison against the original product. Rerun the command after
workflow changes and report the current output separately.

Citation identity does not establish entailment or causality. Live AI usefulness needs
separate expert review with a configured provider. Controlled provider tests cover
refusal, malformed or incomplete output, unsupported references, identity overrides,
output limits, provider failures, and cancellation.

## SQL and retrieval regressions

```sh
pnpm test:rust
pnpm eval:retrieval
```

`migrations/labels.json` and its SQL fixtures exercise the Rust classifier. Wrangler
integration tests also exercise the checked-in WASM with actual SQL submissions.
The generalized evaluation intentionally does not mock SQL parsing and present the
result as WASM correctness. SQLite runtime-error normalization is covered by parser
regressions and a browser investigation; SQL migration hazard analysis remains the
PostgreSQL-specific WASM capability.

`runbooks/questions.json` supplies the preserved retrieval questions. Its initial
local-hash baseline measured recall@3 of 94/100, and the first refactor reproduced
94/100. Those are historical, fixture-specific measurements. They do not establish
current semantic-search quality or production performance.

Run with no provider key to reproduce offline retrieval mode. If an OpenAI key is set,
the preserved retrieval evaluation can use live embeddings and incur provider calls;
report that mode and its results separately. The sidekick's private knowledge library
adds owner-filtered document retrieval, tested independently from the runbook fixture.

## Thread, knowledge, and streaming behavior

The current application uses `/api/threads` and `/api/knowledge`. A message carries a
unique `clientTurnId`, optional failure category/environment details, and pinned context
IDs. Tests exercise same-thread follow-ups, original-failure context, environment
snapshots, safe replay, busy-thread conflicts, cancellation, and late-response races.
Knowledge tests cover bounded chunking, keyword/optional vector indexing, pinned and
retrieved context, persistent deletion, and owner isolation. Unpinning a document does
not exclude it from relevant knowledge retrieval.

Thread SSE emits actual stages and provisional `delta` events before an authoritative
`message` and `done`. Tests distinguish the draft from the final saved response, including
cases where validation or a provider fallback replaces the streamed content. They also
check that interrupted or malformed streams do not leave a partial answer presented as
validated evidence.

Worker test sources include:

- `universalGraph.test.ts` and `investigation.test.ts`: typed graph stages, evidence,
  model validation, and fallback behavior.
- `knowledge.test.ts` and `knowledgeApi.test.mjs`: owner-scoped source storage and retrieval.
- `threadRepository.test.ts` and `threadsApi.test.mjs`: real persistence, replay,
  cancellation, ownership, and compatible history import.
- `threadProviderApi.test.mjs`: controlled provider streaming through the thread API.
- The preserved SQL, one-shot investigation, Durable Object, and WebSocket tests:
  compatibility with the earlier endpoints.

## Frontend and browser verification

```sh
pnpm test
pnpm test:e2e
```

Frontend unit/component tests exercise safe Markdown and code rendering, copy controls,
bounded UTF-8 context files, runtime response validation, cross-thread stream rejection,
and separation of provisional and final messages.

Browser tests run against the actual local frontend and Worker. They cover representative
failure categories, PostgreSQL migrations and SQLite errors in the shared agent,
conversation follow-ups and reload, private context uploads and source inspection,
pin/unpin persistence, deletion, owner isolation, history, and interrupted-turn recovery.
Explicit failure injection covers unavailable networks, malformed responses, cancellation,
and authoritative final-answer replacement. Responsive layout, keyboard focus, modal
controls, overflow, and selected normal-text contrast pairs are checked separately.
These checks are not a complete accessibility certification.

Local tests and evaluation do not verify deployed Cloudflare resources, a production
vector index, or an actual OpenAI answer. Record those verification limits alongside
any measured results.
