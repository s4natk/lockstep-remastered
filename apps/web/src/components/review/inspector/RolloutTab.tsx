"use client";

import { linkSentences } from "../../../lib/citations";
import { isActive, type ReviewRecord } from "../../../lib/review";
import { CopyButton } from "../../ui/CopyButton";
import { Icon } from "../../ui/Icon";
import styles from "./RolloutTab.module.css";

interface RolloutTabProps {
  record: ReviewRecord;
  onOpenSource: (index: number) => void;
}

export function RolloutTab({ record, onOpenSource }: RolloutTabProps) {
  const note = record.note ?? "";
  const citations = record.citations ?? [];
  const sentences = note === "" ? [] : linkSentences(note, citations);

  if (record.status === "completed" && sentences.length === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.banner}>
          <Icon name="alert" />
          <p>Every drafted sentence was removed by the citation check. Nothing in the note quoted a retrieved source.</p>
        </div>
        {record.dropped && record.dropped.length > 0 ? <Dropped sentences={record.dropped} /> : null}
      </div>
    );
  }

  if (sentences.length === 0 && !record.draft && !isActive(record)) {
    return (
      <p className={styles.empty}>
        After the parser and retrieval finish, the model drafts a rollout note. Sentences that do not quote a source are
        dropped.
      </p>
    );
  }

  return (
    <div className={styles.root}>
      {record.drafter === "mock" ? (
        <p className={styles.note}>Demo drafter — this note is a deterministic mock, not a live model.</p>
      ) : null}

      {sentences.length > 0 ? (
        <div className={styles.toolbar}>
          <span>{sentences.length} cited {sentences.length === 1 ? "sentence" : "sentences"}</span>
          <CopyButton text={note} label="Copy rollout note">
            Copy note
          </CopyButton>
        </div>
      ) : null}

      {sentences.length > 0 ? (
        <ol className={styles.sentences}>
          {sentences.map((sentence, index) => (
            <li key={index} className={styles.sentence}>
              <span className={styles.index}>{index + 1}</span>
              <div>
                <p>{sentence.text}</p>
                {sentence.sources.length > 0 ? (
                  <div className={styles.refs}>
                    {sentence.sources.map((source) => (
                      <button
                        key={source}
                        type="button"
                        className={styles.ref}
                        onClick={() => onOpenSource(source)}
                      >
                        {source + 1}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : record.draft || isActive(record) ? (
        <div className={styles.draft} aria-live="polite">
          {record.draft ? <p>{record.draft}</p> : <p className={styles.empty}>Waiting for the first draft tokens.</p>}
          {isActive(record) ? <span className={styles.caret} aria-hidden="true" /> : null}
        </div>
      ) : null}

      {record.dropped && record.dropped.length > 0 ? <Dropped sentences={record.dropped} /> : null}
    </div>
  );
}

function Dropped({ sentences }: { sentences: string[] }) {
  return (
    <details className={styles.dropped}>
      <summary>Removed by the citation check ({sentences.length})</summary>
      <ul>
        {sentences.map((sentence, index) => (
          <li key={index}>{sentence}</li>
        ))}
      </ul>
    </details>
  );
}
