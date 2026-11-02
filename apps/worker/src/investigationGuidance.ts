import type { GuidanceStep, NormalizedFailureContext, RootCauseHypothesis } from "@lockstep/shared";

export interface InvestigationDraft {
  summary: string;
  primaryHypothesis: RootCauseHypothesis | null;
  alternatives: RootCauseHypothesis[];
  remediation: GuidanceStep[];
  verification: GuidanceStep[];
  missingInformation: string[];
  confidence: "low" | "moderate" | "high";
  limitations: string[];
}

export function deterministicDraft(context: NormalizedFailureContext): InvestigationDraft {
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
          explanation: `${first} This is an observation from the excerpt. The underlying cause is not confirmed without the relevant code, runtime state, and reproduction.`,
          evidenceIds: inputIds,
          confidence: "low",
        };
  return {
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
