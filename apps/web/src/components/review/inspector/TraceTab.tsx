"use client";

import { isActive, type ReviewRecord } from "../../../lib/review";
import { formatSpan } from "../../../lib/time";
import { spanDuration, traceRows } from "../../../lib/trace";
import styles from "./TraceTab.module.css";

export function TraceTab({ record }: { record: ReviewRecord }) {
  const spans = record.trace ?? [];
  if (spans.length === 0) {
    return (
      <p className={styles.empty}>
        {isActive(record)
          ? "The Worker attaches OpenTelemetry spans when the review finishes."
          : "No execution trace on this review."}
      </p>
    );
  }

  const rows = traceRows(spans);
  const max = Math.max(...rows.map((row) => row.durationMs), 1);
  const total =
    (spanDuration(spans, "wasm.parse") ?? 0) +
    (spanDuration(spans, "retrieval.hybrid") ?? 0) +
    (spanDuration(spans, "review.draft") ?? 0);

  return (
    <div className={styles.root}>
      <p className={styles.total}>
        Pipeline {formatSpan(total)}
        <span>sum of parse, retrieval, and draft</span>
      </p>
      <ol className={styles.list}>
        {rows.map((row) => (
          <li key={row.name} className={styles.row} data-depth={row.depth}>
            <div className={styles.meta}>
              <span className={styles.label}>{row.label}</span>
              <span className={styles.ms}>{formatSpan(row.durationMs)}</span>
            </div>
            <div className={styles.track} aria-hidden="true">
              <span className={styles.bar} style={{ width: `${Math.max(4, (row.durationMs / max) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
