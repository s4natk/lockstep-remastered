"use client";

import { useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";

import type { AskMessage } from "../../hooks/useAssistant";
import { extraStatementCount, reviewTitle, type ReviewRecord } from "../../lib/review";
import { formatClock } from "../../lib/time";
import { Button, IconButton } from "../ui/Button";
import { HazardTag } from "../ui/HazardTag";
import { Icon } from "../ui/Icon";
import { Kbd } from "../ui/Kbd";
import { Markdown } from "../ui/Markdown";
import { hazardCounts } from "../../lib/hazards";
import styles from "./AskView.module.css";

const STARTERS = [
  "When does CREATE INDEX need CONCURRENTLY?",
  "What's the difference between DROP COLUMN and TRUNCATE?",
  "How should I add a NOT NULL column to a live table?",
];

interface AskViewProps {
  messages: AskMessage[];
  busy: boolean;
  draft: string;
  contextCount: number;
  onDraft: (value: string) => void;
  onSend: (text: string) => boolean;
  onStop: () => void;
  onRetry: (id: string) => void;
  onClear: () => void;
  onOpenReview: (record: ReviewRecord) => void;
  onContext: () => void;
}

export function AskView({
  messages,
  busy,
  draft,
  contextCount,
  onDraft,
  onSend,
  onStop,
  onRetry,
  onClear,
  onOpenReview,
  onContext,
}: AskViewProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = scroller.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages]);

  const submit = (text = draft) => {
    if (onSend(text)) {
      onDraft("");
      field.current?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  return (
    <section className={styles.root} aria-label="Ask assistant">
      <header className={styles.toolbar}>
        <div className={styles.left}>
          <span className={styles.kicker}>Ask</span>
          <span className={styles.hint}>Questions about Postgres DDL. Pasted SQL is reviewed.</span>
        </div>
        <IconButton icon="clear" label="Clear thread" onClick={onClear} disabled={messages.length === 0} />
      </header>

      <div ref={scroller} className={styles.thread}>
        {messages.length === 0 ? (
          <div className={styles.empty}>
            <Icon name="ask" size={20} />
            <h2>Ask about a migration</h2>
            <p>
              The assistant answers from retrieved runbooks. If you paste SQL, Lockstep routes it through the reviewer
              instead.
            </p>
            <ul className={styles.starters}>
              {STARTERS.map((starter) => (
                <li key={starter}>
                  <button type="button" onClick={() => submit(starter)}>
                    {starter}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className={styles.messages}>
            {messages.map((message) => (
              <li key={message.id} className={styles.turn} data-role={message.role}>
                <span className={styles.who}>{message.role === "user" ? "You" : "Lockstep"}</span>
                <span className={styles.time}>{formatClock(message.createdAt)}</span>
                {message.role === "user" ? (
                  <p className={styles.user}>{message.text}</p>
                ) : message.review ? (
                  <ReviewCard
                    message={message}
                    onOpen={() => onOpenReview(message.review!)}
                    onRetry={() => onRetry(message.id)}
                  />
                ) : (
                  <AssistantBody message={message} onRetry={() => onRetry(message.id)} />
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      <form className={styles.composer} onSubmit={onSubmit}>
        <textarea
          ref={field}
          value={draft}
          rows={2}
          placeholder="Ask a question or paste SQL"
          aria-label="Message"
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className={styles.bar}>
          <button type="button" className={styles.context} onClick={onContext}>
            <Icon name="context" size={14} />
            {contextCount === 0 ? "Add context" : `${contextCount} context`}
          </button>
          <span className={styles.shortcut}>
            <Kbd keys={["Mod", "Enter"]} />
          </span>
          {busy ? (
            <Button size="sm" variant="danger" icon="stop" onClick={onStop}>
              Stop
            </Button>
          ) : (
            <Button size="sm" variant="primary" icon="arrowUp" type="submit" disabled={draft.trim() === ""}>
              Send
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}

function AssistantBody({ message, onRetry }: { message: AskMessage; onRetry: () => void }) {
  if (message.status === "waiting") {
    return (
      <p className={styles.pending}>
        <span className={styles.dots} aria-hidden="true" />
        Retrieving runbooks
      </p>
    );
  }
  if (message.status === "error") {
    return (
      <div className={styles.error}>
        <p>{message.error ?? "The Worker did not finish this turn."}</p>
        <Button size="sm" variant="ghost" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  if (message.status === "stopped") {
    return <p className={styles.pending}>Stopped.</p>;
  }
  return (
    <div className={styles.reply}>
      {message.text ? <Markdown source={message.text} /> : null}
      {message.status === "streaming" ? <span className={styles.caret} aria-hidden="true" /> : null}
    </div>
  );
}

function ReviewCard({
  message,
  onOpen,
  onRetry,
}: {
  message: AskMessage;
  onOpen: () => void;
  onRetry: () => void;
}) {
  const review = message.review!;
  const counts = hazardCounts(review.parse);
  const extra = extraStatementCount(review);
  return (
    <div className={styles.card}>
      <div className={styles.cardTop}>
        <Icon name="review" size={14} />
        <strong>{reviewTitle(review)}</strong>
        {extra > 0 ? <span className={styles.extra}>+{extra}</span> : null}
      </div>
      {counts.length > 0 ? (
        <div className={styles.tags}>
          {counts.map((entry) => (
            <HazardTag key={entry.code} code={entry.code} count={entry.count} />
          ))}
        </div>
      ) : (
        <p className={styles.pending}>
          {review.status === "completed" ? "No parser hazards." : "Reviewing this migration…"}
        </p>
      )}
      <div className={styles.cardActions}>
        <Button size="sm" variant="secondary" icon="inspector" onClick={onOpen}>
          Open in workspace
        </Button>
        {message.status === "error" ? (
          <Button size="sm" variant="ghost" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}
