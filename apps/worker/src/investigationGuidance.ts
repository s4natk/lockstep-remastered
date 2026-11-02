import type { GuidanceStep, NormalizedFailureContext, RootCauseHypothesis } from "@lockstep/shared";

export interface InvestigationDraft {
  assistantAnswer?: string;
  summary: string;
  primaryHypothesis: RootCauseHypothesis | null;
  alternatives: RootCauseHypothesis[];
  remediation: GuidanceStep[];
  verification: GuidanceStep[];
  missingInformation: string[];
  confidence: "low" | "moderate" | "high";
  limitations: string[];
}

export interface DeterministicAnswerContext {
  question?: string;
  conversation?: ReadonlyArray<{ role: "user" | "assistant"; content: string }>;
}

export function deterministicDraft(
  context: NormalizedFailureContext,
  options: DeterministicAnswerContext = {},
): InvestigationDraft {
  const findingIds = [...new Set(context.findings.flatMap((finding) => finding.evidenceIds))];
  const inputIds = (
    findingIds.length
      ? findingIds
      : context.evidence.filter((item) => item.kind !== "runbook").map((item) => item.id)
  ).slice(0, 6);
  const runbookIds = context.evidence
    .filter((item) => item.kind === "runbook")
    .slice(0, 2)
    .map((item) => item.id);
  const evidenceIds = [...inputIds, ...runbookIds];
  const first =
    context.errorMessages[0] ??
    context.findings[0]?.message ??
    "The submitted excerpt does not identify a recognizable failure.";
  const steps: Record<string, [string, string, string, string]> = {
    runtime_exception: [
      "Trace the failing value or operation",
      "Inspect the first application stack frame and trace the value, dependency, or operation named in the exception back to its producer. Compare the observed runtime inputs with the expected contract.",
      "Reproduce the failing execution path",
      "Run the smallest reproduction under the same runtime and dependency versions. Add a regression check for the failing input, then rerun the containing test suite.",
    ],
    test_failure: [
      "Compare expected behavior with the fixture",
      "Inspect the expected and received values and the test setup. Determine whether the implementation or the expectation violates the intended contract before changing either.",
      "Rerun the failing test and its suite",
      "Run the single failing test with the same seed and environment, then run its suite to check for order dependence and regressions.",
    ],
    http_error: [
      "Inspect the request and server response",
      "Check the status code, method, endpoint, payload, authentication scopes, and response metadata. Correlate request identifiers with server logs. For 429, respect Retry-After and reduce concurrency; avoid printing tokens.",
      "Repeat a minimal request safely",
      "Replay a minimal non-destructive request under the same environment after the suspected fix. Confirm the expected status and payload, and inspect server logs for recurring errors.",
    ],
    application_log: [
      "Correlate events around the failure",
      "Follow timestamps and request identifiers to the earliest error and the relevant dependency or deployment change. Collect surrounding events before choosing a fix.",
      "Repeat the triggering workload",
      "Reproduce the same workload in a safe environment and compare the error sequence and dependency behavior after the change.",
    ],
    database_error: [
      "Check the query against the deployed schema",
      "Inspect the constraint, relation, column, transaction, and migration version named by the database. Use read-only schema inspection and safe fixtures; do not disable constraints or delete production data to diagnose the error.",
      "Rerun with a safe fixture",
      "Repeat the original query against a representative test database after the reviewed change. Confirm expected rows and constraint behavior, and run database regression tests.",
    ],
    sql_migration: [
      "Review each parser-reported migration hazard",
      "Confirm table size, lock budget, PostgreSQL version, and rollback requirements. Rehearse the migration on a representative database and use the cited rollout runbooks to choose a safe sequence.",
      "Rehearse migration and rollback",
      "Run the migration against a disposable representative database. Measure lock duration, inspect resulting schema and data, and test the rollback or forward-recovery procedure before production.",
    ],
    unknown: [
      "Collect a concrete failure excerpt",
      "Include the exact error message, the action that triggered it, and a small surrounding log or stack-trace excerpt. Remove credentials and personal data before submitting.",
      "Establish a reproducible baseline",
      "Record the expected and actual behavior and reproduce it consistently before attempting a fix.",
    ],
  };
  const [fixTitle, fixDetail, verifyTitle, verifyDetail] = steps[context.kind] ?? steps.unknown!;
  const primaryHypothesis: RootCauseHypothesis | null =
    context.kind === "unknown" || !inputIds.length
      ? null
      : {
          id: "hypothesis:1",
          title: hypothesisTitle(context),
          explanation: `${first.slice(0, 1600)} This is an observation from the excerpt. The underlying cause is not confirmed without the relevant code, runtime state, and reproduction.`,
          evidenceIds: inputIds,
          confidence: "low",
        };
  return {
    assistantAnswer: deterministicAnswer(context, options),
    summary: `${context.kind.replaceAll("_", " ")}: ${first}`.slice(0, 1600),
    primaryHypothesis,
    alternatives: [],
    remediation: evidenceIds.length ? [{ title: fixTitle, detail: fixDetail, evidenceIds }] : [],
    verification: evidenceIds.length
      ? [{ title: verifyTitle, detail: verifyDetail, evidenceIds }]
      : [],
    missingInformation: [
      "A minimal reproduction and relevant application code",
      "Runtime, dependency, and deployment versions",
      ...(context.input.description ? [] : ["What changed and what behavior was expected"]),
    ],
    confidence: "low",
    limitations: [
      "Deterministic analysis identifies observations and investigation steps; it does not establish a root cause.",
      "A valid citation identifies a source, but does not prove that an inferred explanation is correct.",
      "Submitted code, SQL, and commands are never executed.",
    ],
  };
}

function hypothesisTitle(context: NormalizedFailureContext): string {
  const excerpt = context.errorMessages.join(" ").toLowerCase();
  if (context.kind === "sql_migration")
    return context.metadata.sqlHazards === "0"
      ? "No supported SQL hazard was identified"
      : "The migration contains an operation requiring rollout review";
  if (/nonetype|null|undefined|cannot read propert/.test(excerpt))
    return "An operation received a missing or incompatible value";
  if (/modulenotfound|importerror|cannot find module/.test(excerpt))
    return "A required module could not be resolved in this runtime";
  if (context.metadata.status === "401") return "The request may lack valid authentication";
  if (context.metadata.status === "403") return "The caller may lack permission for this resource";
  if (context.metadata.status === "429") return "The request rate may exceed the service quota";
  if (/duplicate key|unique constraint|foreign key|not-null/.test(excerpt))
    return "A database constraint rejected the write";
  if (context.kind === "test_failure") return "Actual behavior differs from the test expectation";
  return "The failure originates in the operation shown by the submitted evidence";
}

function markdownText(value: string): string {
  return value.replace(/[\\`*_{}[\]<>]/g, "\\$&");
}

export function deterministicAnswer(
  context: NormalizedFailureContext,
  options: DeterministicAnswerContext = {},
): string {
  const question = (options.question ?? context.input.description ?? "").slice(0, 8000);
  const lower = question.toLowerCase();
  const followup = Boolean(options.conversation?.some((message) => message.role === "assistant"));
  const finding =
    context.findings.find((item) => /error|message|assertion|status|connection/.test(item.code)) ??
    context.findings[0];
  const evidenceId =
    finding?.evidenceIds[0] ??
    context.evidence.find((item) => item.kind === "input" || item.kind === "context")?.id;
  const citation = evidenceId ? ` [${evidenceId}]` : "";
  const observed =
    context.errorMessages[0] ??
    finding?.message ??
    "The excerpt does not identify a supported failure signature.";
  const parts = [
    "**Deterministic analysis.** This reply uses parsing and supplied context; no live model generated it.",
  ];
  if (followup && question.trim())
    parts.push(
      `For your follow-up, “${markdownText(question.trim().slice(0, 400))}”, I am keeping the original failure and earlier evidence in view.`,
    );
  parts.push(
    `### What the evidence shows\n${markdownText(observed.slice(0, 1400))}${citation}\n\nThe underlying cause is still a hypothesis. The excerpt alone does not establish where the failing value or state originated.`,
  );
  if (/where|which.*line|stack|file|location/.test(lower) && context.stackFrames.length) {
    const locations = context.stackFrames
      .slice(0, 4)
      .map(
        (frame) =>
          `- ${markdownText(frame.file)}${frame.line ? `:${frame.line}` : ""}${frame.function ? ` in ${markdownText(frame.function)}` : ""} [${frame.evidenceId}]`,
      );
    parts.push(
      `### Inspect these locations\n${locations.join("\n")}\n\nStart at the first frame belonging to your application, then trace the relevant value back to its producer.`,
    );
  }
  const signature =
    `${context.errorMessages.join(" ")} ${context.metadata.errorType ?? ""}`.toLowerCase();
  const wantsCode = /code|example|fix|guard|handle|prevent/.test(lower);
  if (context.kind === "runtime_exception" && /nonetype|null|undefined/.test(signature)) {
    parts.push(
      `### Next step\nIdentify which value is missing before the failing operation. Inspect its producer and decide whether absence is an expected case or a broken contract. A guard prevents an invalid access; it does not explain why the value was missing.${citation}`,
    );
    if (wantsCode) {
      const python = context.metadata.language === "python" || /nonetype/.test(signature);
      parts.push(
        python
          ? 'Illustrative guard; adapt `value` and the intended missing-value behavior to your code:\n\n```python\nif value is None:\n    raise ValueError("Expected a value before using it")\n# Continue only after the producer\'s contract is satisfied.\n```'
          : 'Illustrative guard; adapt `value` and the intended missing-value behavior to your code:\n\n```typescript\nif (value == null) {\n  throw new Error("Expected a value before reading its properties");\n}\n```',
      );
    }
  } else if (context.kind === "runtime_exception" && /keyerror/.test(signature)) {
    parts.push(
      `### Next step\nThe mapping does not contain the requested key. Check the incoming payload and the code that builds it. Decide whether the field is required or a default is valid; avoid hiding an invalid request with an arbitrary fallback.${citation}`,
    );
    if (wantsCode)
      parts.push(
        'Illustrative validation; adapt `expected_key` and `payload` to your application contract:\n\n```python\nrequired_key = "expected_key"\nif required_key not in payload:\n    raise ValueError(f"Missing required field: {required_key}")\nvalue = payload[required_key]\n```',
      );
  } else if (context.kind === "runtime_exception") {
    parts.push(
      `### Next step\nInspect the first application stack frame and trace the operation named in the exception to its inputs. Compare runtime values, dependency availability, and expected contracts under the same environment.${citation}`,
    );
  } else if (context.kind === "test_failure")
    parts.push(
      `### Next step\nCompare the exact expected and actual values with the fixture and intended contract. Re-run the single failing test in isolation before changing implementation or expectations; then re-run its containing suite.${citation}`,
    );
  else if (context.kind === "http_error") {
    const status = context.metadata.status;
    const detail =
      status === "429"
        ? "Respect Retry-After, reduce request concurrency, and use a bounded retry policy with jitter."
        : status === "401" || status === "403"
          ? "Check the target environment, token validity, required scopes, and resource permissions without printing credential values."
          : context.metadata.networkError
            ? "Check the endpoint and dependency reachability from the failing runtime. Confirm the service is listening before changing timeout values."
            : "Compare the method, path, payload schema, and response metadata with a minimal known-valid request; correlate server-side request identifiers.";
    parts.push(`### Next step\n${detail}${citation}`);
  } else if (context.kind === "database_error")
    parts.push(
      `### Next step\nInspect the named relation, column, or constraint with read-only schema inspection. Compare the deployed migration version with the query's assumptions and reproduce with a safe fixture; do not disable constraints or delete production data to diagnose it.${citation}`,
    );
  else if (context.kind === "sql_migration")
    parts.push(
      `### Next step\nReview each parser-reported hazard, table size, lock budget, and PostgreSQL version. Rehearse the migration and recovery procedure on a disposable representative database; the SQL is never executed here.${citation}`,
    );
  else if (context.kind === "application_log")
    parts.push(
      `### Next step\nCorrelate the earliest error with preceding events, request identifiers, dependency health, and deployment changes. An error-level log by itself does not prove the cause.${citation}`,
    );
  else
    parts.push(
      "### Next step\nProvide the exact error, what action triggered it, and the expected behavior. Include the smallest relevant stack trace or surrounding log excerpt so the next investigation has concrete evidence.",
    );
  const supplied = context.evidence
    .filter((item) => item.kind === "context" && item.provenance.sourceId.startsWith("knowledge:"))
    .slice(0, 2);
  if (supplied.length)
    parts.push(
      `### Relevant supplied context\n${supplied.map((item) => `- **${markdownText(item.label)}:** ${markdownText(item.content.slice(0, 700))} [${item.id}]`).join("\n")}\n\nThese excerpts are source material, not verified instructions or proof of a cause.`,
    );
  if (/still|didn.t work|already|same error/.test(lower))
    parts.push(
      "Since the reported attempt did not resolve the issue, collect the first application frame and the value immediately before it fails. Compare the producer's output with the expected contract; avoid repeating the same change without a new observation.",
    );
  parts.push(
    "### Verify and continue\nReproduce the same failing input after the reviewed change, confirm the expected behavior, and add a regression check before running the broader suite.\n\nWhat is the relevant application code and runtime version, and what did you observe when you reproduced the failure?",
  );
  return parts.join("\n\n");
}
