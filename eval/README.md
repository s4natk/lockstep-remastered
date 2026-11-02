# Evaluation

Evaluation separates parsing, retrieval, citation identity, diagnostic expectations,
actionability, reliability, and local timing. It does not collapse them into an
unsupported numerical confidence score or claim to measure live AI quality.

## General investigations

```sh
pnpm eval:investigations
```

`investigations/cases.json` contains 20 labeled cases: 18 complete deterministic
workflows, one SQL normalization case, and one expected empty-input rejection.
Fixtures record the input, expected kind, deterministic finding codes, relevant
runbook IDs, acceptable explanation terms, unsupported claims, and expected guidance.

The runner always disables model credentials and uses the bundled keyword corpus.
It checks observations against expected findings and verifies every citation ID
against actual evidence. Diagnostic and actionability checks compare explicit
lexical expectations; they are regression checks rather than a human diagnosis rubric.
Reliability checks that expected rejection succeeds or that a complete validated report
is returned. Failures produce a nonzero exit code.

A measured release run passed:

| Dimension                                 |    Result |
| ----------------------------------------- | --------: |
| Parsing and validation                    |   20 / 20 |
| Labeled relevant runbooks retrieved       |   17 / 17 |
| Citation identifiers                      | 198 / 198 |
| Diagnostic lexical expectations           |   18 / 18 |
| Remediation and verification expectations |   18 / 18 |
| Reliability expectations                  |   20 / 20 |

That run recorded p50 0.261 ms and p95 9.929 ms across 18 local deterministic workflow
samples. These small, warm-process measurements exclude model calls, embeddings,
network, persistence, production scheduling, and SQL/WASM execution. They are not
production latency, an SLA, or a comparison against the original product.

Citation identity does not establish entailment or causality. Live AI usefulness
requires separate expert review with configured provider credentials. The test suite
uses controlled provider responses to exercise refusal, invalid JSON, unsupported
references, identity overrides, output limits, and provider failures.

## SQL regression evaluation

```sh
pnpm test:rust
pnpm eval:retrieval
```

`migrations/labels.json` and its SQL fixtures exercise the actual Rust classifier.
The 13 Rust tests include 25 labeled migration fixtures. Wrangler integration tests
exercise the checked-in WASM with real SQL submissions; the generalized evaluation
runner intentionally does not mock SQL parsing and report it as WASM correctness.

The preserved `runbooks/questions.json` evaluation has 100 retrieval questions.
The measured local-hash baseline and post-refactor result are both recall@3 94/100.
This is a fixture-specific retrieval measurement, not a production benchmark.
Set no provider key to reproduce that offline mode. If an OpenAI key is set, the
legacy retrieval evaluation uses live embeddings and incurs provider calls; its
results must be reported separately.

## Browser and API behavior

`pnpm test` includes real local Wrangler API, D1, Durable Object, and WebSocket checks
as well as parser, citation, provider, retrieval, and frontend component tests.
`pnpm test:e2e` runs actual browser workflows against the local frontend and backend.
Browser failure injection covers cancellation, incomplete streams, offline behavior,
invalid reports, and unavailable saved sessions. These tests do not verify deployed
Cloudflare resources or a live OpenAI response.
