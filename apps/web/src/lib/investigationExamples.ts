import type { FailureKind } from "@lockstep/shared";

export const FAILURE_LABELS: Record<FailureKind, string> = {
  runtime_exception: "Runtime exception",
  test_failure: "Test failure",
  http_error: "HTTP / API failure",
  application_log: "Application log",
  database_error: "Database error",
  sql_migration: "SQL migration",
  unknown: "Unknown",
};

export interface FailureExample {
  id: string;
  title: string;
  kind: FailureKind;
  description: string;
  input: string;
}

export const FAILURE_EXAMPLES: FailureExample[] = [
  {
    id: "python",
    title: "Python · missing dictionary key",
    kind: "runtime_exception",
    description: "The order endpoint fails when creating a shipment.",
    input:
      'Traceback (most recent call last):\n  File "app/routes/orders.py", line 42, in create_order\n    shipment = build_shipment(payload)\n  File "app/services/shipping.py", line 18, in build_shipment\n    postal_code = payload["address"]["postal_code"]\nKeyError: \'postal_code\'',
  },
  {
    id: "javascript",
    title: "JavaScript · undefined property",
    kind: "runtime_exception",
    description: "A user profile request fails after a session expires.",
    input:
      "TypeError: Cannot read properties of undefined (reading 'email')\n    at getProfile (src/services/profile.ts:28:19)\n    at handleRequest (src/routes/profile.ts:14:22)",
  },
  {
    id: "java",
    title: "Java · null reference",
    kind: "runtime_exception",
    description: "The checkout service fails while resolving a customer.",
    input:
      'java.lang.NullPointerException: Cannot invoke "Customer.getId()" because "customer" is null\n\tat com.example.CheckoutService.create(CheckoutService.java:58)\n\tat com.example.CheckoutController.post(CheckoutController.java:24)',
  },
  {
    id: "rust",
    title: "Rust · unwrap panic",
    kind: "runtime_exception",
    description: "A worker exits while reading an optional configuration value.",
    input:
      "thread 'main' panicked at src/config.rs:17:34:\ncalled `Option::unwrap()` on a `None` value\nstack backtrace:\n   0: rust_begin_unwind\n   1: app::config::load",
  },
  {
    id: "test",
    title: "Pytest · assertion mismatch",
    kind: "test_failure",
    description: "The totals test fails after changing the pricing calculation.",
    input:
      "FAILED tests/test_checkout.py::test_total_with_discount\n\n    def test_total_with_discount():\n>       assert calculate_total(100, discount=10) == 90\nE       assert 100 == 90\nE        + where 100 = calculate_total(100, discount=10)\n\n1 failed, 8 passed in 0.24s",
  },
  {
    id: "http",
    title: "HTTP · rate limit response",
    kind: "http_error",
    description: "An API integration returns an error during a burst of requests.",
    input:
      'POST /v1/events HTTP/1.1\nHTTP/1.1 429 Too Many Requests\nContent-Type: application/json\nRetry-After: 30\n\n{"error":{"code":"rate_limit_exceeded","message":"Request quota exceeded. Retry after 30 seconds."}}',
  },
  {
    id: "logs",
    title: "Logs · connection timeout",
    kind: "application_log",
    description: "The worker stops processing jobs after a cache reconnect attempt.",
    input:
      '{"timestamp":"2026-10-30T14:20:00Z","level":"info","message":"Starting job","jobId":"job-482"}\n{"timestamp":"2026-10-30T14:20:02Z","level":"warn","message":"Cache connection retry","attempt":3}\n{"timestamp":"2026-10-30T14:20:07Z","level":"error","message":"Connection timeout","code":"ETIMEDOUT","service":"cache"}',
  },
  {
    id: "database",
    title: "PostgreSQL · missing column",
    kind: "database_error",
    description: "A query starts failing after deploying a new application version.",
    input:
      'ERROR: column "last_seen_at" does not exist\nSQLSTATE: 42703\nSTATEMENT: SELECT id, last_seen_at FROM users WHERE id = $1;\nPOSITION: 12',
  },
  {
    id: "sql",
    title: "SQL · destructive migration",
    kind: "sql_migration",
    description: "Review this migration before applying it to a production database.",
    input:
      "ALTER TABLE users ADD COLUMN display_name text NOT NULL;\nDROP TABLE sessions;\nCREATE INDEX users_email_idx ON users (email);",
  },
];
