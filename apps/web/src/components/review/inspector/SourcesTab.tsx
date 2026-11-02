"use client";

import type { Citation, CitationKind } from "@lockstep/shared";

import { contextIndexOf, statementIndexOf } from "../../../lib/citations";
import type { ReviewRecord } from "../../../lib/review";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import styles from "./SourcesTab.module.css";

const KIND_LABEL: Record<CitationKind, string> = {
  parser: "Parser",
  runbook: "Runbook",
  context: "Context",
};

interface SourcesTabProps {
  record: ReviewRecord;
  highlight?: number | null;
  onJumpStatement: (index: number) => void;
}

export function SourcesTab({ record, highlight, onJumpStatement }: SourcesTabProps) {
  const citations = record.citations ?? [];
  if (citations.length === 0) {
    return (
      <p className={styles.empty}>
        {record.status === "completed"
          ? "The citation check kept no quotes."
          : "Sources appear after the Worker finishes the review."}
      </p>
    );
  }

  return (
    <ol className={styles.list}>
      {citations.map((citation, index) => (
        <li
          key={`${citation.kind}:${citation.sourceId}:${index}`}
          className={styles.card}
          data-active={highlight === index || undefined}
        >
          <div className={styles.top}>
            <span className={styles.kind}>
              <Icon name={kindIcon(citation.kind)} size={14} />
              {KIND_LABEL[citation.kind]}
            </span>
            <span className={styles.source}>{sourceLabel(citation, record)}</span>
          </div>
          <blockquote className={styles.quote}>“{citation.quote}”</blockquote>
          {citation.kind === "parser" ? (
            <Button size="sm" variant="ghost" icon="review" onClick={() => {
              const statement = statementIndexOf(citation.sourceId);
              if (statement !== null) {
                onJumpStatement(statement);
              }
            }}>
              Jump to statement
            </Button>
          ) : null}
          {citation.kind === "context" ? <ContextPreview citation={citation} record={record} /> : null}
        </li>
      ))}
    </ol>
  );
}

function ContextPreview({ citation, record }: { citation: Citation; record: ReviewRecord }) {
  const index = contextIndexOf(citation.sourceId);
  const entry = index === null ? undefined : record.context?.[index];
  if (!entry) {
    return null;
  }
  return (
    <p className={styles.context}>
      {entry.title ? <strong>{entry.title} · </strong> : null}
      {entry.text}
    </p>
  );
}

function kindIcon(kind: CitationKind) {
  switch (kind) {
    case "parser":
      return "review" as const;
    case "runbook":
      return "library" as const;
    case "context":
      return "context" as const;
  }
}

function sourceLabel(citation: Citation, record: ReviewRecord): string {
  const statement = statementIndexOf(citation.sourceId);
  if (statement !== null) {
    return `statement ${statement + 1}`;
  }
  const context = contextIndexOf(citation.sourceId);
  if (context !== null) {
    const title = record.context?.[context]?.title;
    return title ? title : citation.sourceId;
  }
  return citation.sourceId;
}
