import type { FailureKind } from "@lockstep/shared";
import { runbookChunks } from "./runbookChunks.js";

export interface InvestigationRunbook {
  id: string;
  title: string;
  text: string;
  kinds: FailureKind[];
  url?: string;
}

export const investigationRunbooks: InvestigationRunbook[] = [
  {
    id: "runtime-null",
    title: "Trace invalid value access",
    kinds: ["runtime_exception"],
    text: "TypeError, NoneType, null, and undefined access indicate that an operation received a value it cannot use. Inspect the first application stack frame, trace the value back to its producer, and verify the expected input contract. A stack trace alone does not establish why the value was missing.",
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Unexpected_type",
  },
  {
    id: "runtime-import",
    title: "Check module and dependency resolution",
    kinds: ["runtime_exception"],
    text: "ModuleNotFoundError, ImportError, and Cannot find module can result from a missing dependency, an unexpected runtime environment, or an incorrect import path. Reproduce using the same interpreter, working directory, dependency lockfile, and deployment artifact. Verify the import independently before rerunning the failing path.",
  },
  {
    id: "test-assertion",
    title: "Investigate an assertion mismatch",
    kinds: ["test_failure"],
    text: "An assertion mismatch establishes that actual behavior differed from the expectation. Check expected and received values, fixture setup, ordering, and recent behavior changes. Rerun the single failing test in isolation and then the containing suite. Do not update snapshots or weaken assertions until the intended behavior is established.",
  },
  {
    id: "http-auth",
    title: "Distinguish authentication and authorization",
    kinds: ["http_error"],
    text: "HTTP 401 indicates missing or invalid authentication credentials; HTTP 403 indicates that the server refuses the request. Verify the target environment, token validity, required scopes, and resource permissions without printing credential values. Retry the same request with known valid authorization.",
    url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/401",
  },
  {
    id: "http-client",
    title: "Inspect a rejected HTTP request",
    kinds: ["http_error"],
    text: "HTTP 400 indicates a request the server cannot process; HTTP 404 indicates no matching resource was found. Check the request method, path, payload schema, content type, and deployed API version. Compare a minimal known valid request and inspect the server's validation response.",
  },
  {
    id: "http-rate",
    title: "Handle HTTP rate limiting",
    kinds: ["http_error"],
    text: "HTTP 429 indicates too many requests. Inspect Retry-After, request concurrency, per-client quotas, and repeated retries. Reduce concurrency and use capped exponential backoff with jitter. Verify a reduced request rate succeeds and monitor retry volume.",
    url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/429",
  },
  {
    id: "http-server",
    title: "Correlate a server-side failure",
    kinds: ["http_error", "application_log"],
    text: "HTTP 500 and other 5xx responses establish a server-side request failure but do not identify its cause. Correlate request identifiers with server exceptions, dependency health, and deployment changes. Capture a minimal reproduction and verify the request succeeds after the suspected fix.",
  },
  {
    id: "network-timeout",
    title: "Investigate connectivity and timeouts",
    kinds: ["http_error", "application_log", "runtime_exception"],
    text: "ETIMEDOUT, ECONNREFUSED, connection refused, and timeout errors may reflect an unavailable dependency, incorrect endpoint, exhausted connection pool, or restrictive timeout. Check reachability and dependency health from the failing runtime. Measure response duration before adjusting timeouts; increasing a timeout alone does not repair an unavailable dependency.",
  },
  {
    id: "log-correlation",
    title: "Correlate log events",
    kinds: ["application_log"],
    text: "Application logs are observations emitted by a component. Correlate timestamps, request identifiers, error events, and preceding state changes across the relevant service. An ERROR log does not by itself prove the root cause. Collect the earliest causal event and verify that the error no longer occurs under the same workload.",
  },
  {
    id: "database-constraint",
    title: "Investigate database constraints",
    kinds: ["database_error"],
    text: "PostgreSQL duplicate key, foreign key, and not-null violations indicate a constraint rejected a write. Inspect the constraint name, offending key, and transaction path. Verify schema compatibility and application validation. Reproduce with a safe fixture; avoid disabling constraints or deleting production data as a diagnostic shortcut.",
    url: "https://www.postgresql.org/docs/current/errcodes-appendix.html",
  },
  {
    id: "database-schema",
    title: "Verify the deployed database schema",
    kinds: ["database_error"],
    text: "PostgreSQL relation does not exist, column does not exist, and undefined table or column errors can indicate an incorrect schema, search_path, environment, or migration order. Compare the actual deployed schema to the query's assumptions using read-only inspection. Apply reviewed migrations in the intended order and rerun the original query safely.",
  },
  ...runbookChunks.map((chunk) => ({
    ...chunk,
    title: chunk.id.replaceAll("-", " "),
    kinds: ["sql_migration" as const],
  })),
];
