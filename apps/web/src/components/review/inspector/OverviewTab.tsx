"use client";

import type { Hazard } from "@lockstep/shared";

import { hazardCounts, hazardKey, plural } from "../../../lib/hazards";
import { extraStatementCount, isActive, reviewTitle, type ReviewRecord } from "../../../lib/review";
import { formatElapsed } from "../../../lib/time";
import { Button } from "../../ui/Button";
import { CodeBlock } from "../../ui/CodeBlock";
import { HazardTag } from "../../ui/HazardTag";
import { Icon } from "../../ui/Icon";
import { hazardLine } from "../editorHazards";
import { isParserRejection, pipelineSteps, statusText } from "./pipeline";
import styles from "./OverviewTab.module.css";

interface OverviewTabProps {
  record: ReviewRecord;
  activeHazard: string | null;
  onSelectHazard: (hazard: Hazard, key: string) => void;
}

export function OverviewTab({ record, activeHazard, onSelectHazard }: OverviewTabProps) {
  const parse = record.parse;
  const hazards = parse?.hazards ?? [];
  const statements = parse?.statements.length ?? 0;
  const counts = hazardCounts(parse);
  const elapsed =
    record.finishedAt !== undefined ? formatElapsed(record.finishedAt - record.createdAt) : undefined;

  return (
    <div className={styles.root}>
      <Pipeline record={record} />

      {record.status === "failed" || record.status === "stopped" ? (
        <div className={styles.banner} data-tone={record.status === "failed" ? "danger" : "neutral"}>
          <Icon name={record.status === "failed" ? "alert" : "stop"} />
          <div>
            <p>{statusText(record)}</p>
            {record.error ? <p className={styles.error}>{record.error}</p> : null}
          </div>
        </div>
      ) : null}

      {record.failure === "answered-as-chat" && record.reply ? (
        <div className={styles.banner} data-tone="neutral">
          <Icon name="info" />
          <p>The Worker answered this as a question. Open Ask to continue the thread, or send it as a review.</p>
        </div>
      ) : null}

      <section className={styles.stats} aria-label="Review summary">
        <Stat label="Statements" value={parse ? String(statements) : "—"} hint={reviewHint(record)} />
        <Stat
          label="Hazards"
          value={parse ? String(hazards.filter((hazard) => hazard.code !== "safe").length) : "—"}
          hint={parse ? plural(hazards.length, "parser finding") : "Waiting for parse"}
        />
        <Stat
          label="Duration"
          value={elapsed ?? (isActive(record) ? "…" : "—")}
          hint={record.drafter === "mock" ? "Demo drafter" : record.drafter === "live" ? "Live model" : "Worker"}
        />
      </section>

      {counts.length > 0 ? (
        <div className={styles.tags}>
          {counts.map((entry) => (
            <HazardTag key={entry.code} code={entry.code} count={entry.count} />
          ))}
        </div>
      ) : null}

      {isParserRejection(record) ? (
        <p className={styles.empty}>The Rust parser rejected this input before retrieval started.</p>
      ) : hazards.length === 0 && parse ? (
        <p className={styles.empty}>The parser reported no hazards on this migration.</p>
      ) : hazards.length === 0 ? (
        <p className={styles.empty}>
          {isActive(record) ? "Waiting for the parser." : "Run a review to see parser findings."}
        </p>
      ) : (
        <ol className={styles.list}>
          {hazards.map((hazard, index) => {
            const key = hazardKey(hazard, index);
            return (
              <li key={key}>
                <div
                  className={styles.item}
                  data-active={key === activeHazard || undefined}
                >
                  <button
                    type="button"
                    className={styles.itemHit}
                    onClick={() => onSelectHazard(hazard, key)}
                  >
                    <div className={styles.itemTop}>
                      <HazardTag code={hazard.code} />
                      <span className={styles.meta}>
                        Statement {hazard.statementIndex + 1}
                        {parse ? ` · line ${hazardLine(record.sql, hazard)}` : ""}
                      </span>
                    </div>
                    <p className={styles.reason}>{hazard.reason}</p>
                  </button>
                  <CodeBlock code={hazard.sql} maxHeight={88} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Pipeline({ record }: { record: ReviewRecord }) {
  const steps = pipelineSteps(record);
  return (
    <ol className={styles.pipeline} aria-label="Review pipeline">
      {steps.map((step, index) => (
        <li key={step.key} className={styles.step} data-state={step.state}>
          {index > 0 ? <span className={styles.rule} aria-hidden="true" /> : null}
          <span className={styles.dot} aria-hidden="true" />
          <span>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statHint}>{hint}</span>
    </div>
  );
}

function reviewHint(record: ReviewRecord): string {
  if (!record.parse) {
    return isActive(record) ? statusText(record) : "Not parsed yet";
  }
  const extra = extraStatementCount(record);
  return extra > 0 ? `${reviewTitle(record)} +${extra}` : reviewTitle(record);
}

export function OverviewEmpty({ onExamples }: { onExamples: () => void }) {
  return (
    <div className={styles.vacant}>
      <Icon name="review" size={20} />
      <h3>No review yet</h3>
      <p>Paste a PostgreSQL migration and run it. The parser, retrieved runbooks, and cited rollout note land here.</p>
      <Button size="sm" icon="library" onClick={onExamples}>
        Browse examples
      </Button>
    </div>
  );
}
