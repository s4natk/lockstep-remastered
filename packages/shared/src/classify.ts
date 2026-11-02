import { plainText } from "./parsing.js";
import { isRecord } from "./validation.js";
import type { FailureKind } from "./investigation.js";

export function detectFailureKind(input: string): FailureKind {
  const text = plainText(input);
  if (isStructuredLog(text)) return "application_log";
  if (/\bSQLITE_[A-Z_]+\b|sqlite3\.(?:OperationalError|IntegrityError|DatabaseError):/i.test(text))
    return "database_error";
  if (
    /\b(?:SQLSTATE|PostgreSQL|psycopg\d?|PG::\w+|SequelizeDatabaseError)\b|(?:ERROR|FATAL):\s*(?:relation|column|duplicate key|deadlock|syntax error|password authentication|permission denied for|connection|remaining connection|current transaction|canceling statement)|violates (?:foreign key|not-null|unique) constraint/i.test(
      text,
    )
  ) {
    return "database_error";
  }
  if (
    /^\s*(?:--[^\n]*\n\s*)*(?:(?:ALTER|CREATE|DROP)\s+(?:UNIQUE\s+)?(?:TABLE|INDEX|TYPE|SCHEMA)|TRUNCATE\b|BEGIN\s*;)/i.test(
      text,
    )
  ) {
    return "sql_migration";
  }
  if (
    /\b(?:FAILED\s+[^\n]+::|FAIL\s+[^\n]+\.(?:[jt]sx?|test)|AssertionError|assertion (?:failed|mismatch)|expected\s*[:=].*received|Tests:\s*\d+ failed|test result:\s*FAILED|(?:pytest|vitest|jest)[^\n]*(?:fail|error))\b|^\s*[E>]\s+(?:assert|AssertionError)|Expected:|Received:/im.test(
      text,
    )
  ) {
    return "test_failure";
  }
  if (
    /\bHTTP(?:\/\d(?:\.\d)?)?\s+[45]\d\d\b|\b(?:GET|POST|PUT|PATCH|DELETE|HEAD)\s+\S+\s+[45]\d\d\b|"(?:status|statusCode|status_code)"\s*:\s*[45]\d\d|\b(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|request timed out|connection timed out)\b/i.test(
      text,
    )
  ) {
    return "http_error";
  }
  if (
    /\bTraceback \(most recent call last\)|^\s*(?:\w+\.)*(?:\w*Error|\w*Exception):|^\s*at\s+\S.*:\d+(?::\d+)?\)?\s*$|\bthread '[^']+' panicked at\b|Exception in thread /m.test(
      text,
    )
  ) {
    return "runtime_exception";
  }
  if (
    /^\s*\{[^\n]*"(?:level|severity|message|msg)"\s*:|^\s*\d{4}-\d\d-\d\d[T ][^\n]+|\b(?:ERROR|WARN|FATAL|CRITICAL|SEVERE|INFO|DEBUG|TRACE)\b/m.test(
      text,
    )
  ) {
    return "application_log";
  }
  return "unknown";
}

function isStructuredLog(text: string): boolean {
  const hasLogEnvelope = (value: unknown): boolean =>
    isRecord(value) &&
    (typeof value.level === "string" ||
      typeof value.severity === "string" ||
      ((typeof value.timestamp === "string" || typeof value.time === "string") &&
        (typeof value.message === "string" || typeof value.msg === "string")));
  try {
    if (hasLogEnvelope(JSON.parse(text))) return true;
  } catch {
    /* A log stream can contain one JSON object per line. */
  }
  return text.split(/\r\n|\n|\r/).some((line) => {
    if (!line.trim().startsWith("{")) return false;
    try {
      return hasLogEnvelope(JSON.parse(line));
    } catch {
      return false;
    }
  });
}
