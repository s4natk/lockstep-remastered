"use client";

import { useEffect, useRef } from "react";
import type { Hazard } from "@lockstep/shared";

import type { ChatMessage, ExampleCard } from "../lib/chat";
import { ThinkingBubble } from "./ThinkingBubble";

interface ChatThreadProps {
  messages: ChatMessage[];
  examples: ExampleCard[];
  busy: boolean;
  onExample: (sql: string) => void;
}

export function ChatThread({ messages, examples, busy, onExample }: ChatThreadProps) {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scroller.current;
    if (element === null) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [messages]);

  return (
    <div className="thread" ref={scroller}>
      {messages.length === 0 ? (
        <div className="empty-wrap">
          <div className="empty">
            <div className="empty-glow" aria-hidden="true" />
            <h2>Migration review assistant</h2>
            <p className="lede">
              Say hi, ask about Postgres DDL, or paste a migration for a grounded rollout note.
            </p>
            <p className="try-label">Try an example</p>
            <div className="examples">
              {examples.map((example) => (
                <button
                  key={example.title}
                  type="button"
                  className="example"
                  disabled={busy}
                  onClick={() => onExample(example.sql)}
                >
                  <span className="example-title">{example.title}</span>
                  <span className="example-hint">
                    click to try <span aria-hidden="true">›</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="ready-line">
              <span className="ready-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              ready for input
              <span className="caret" aria-hidden="true" />
            </p>
          </div>
        </div>
      ) : (
        <div className="transcript">
          {messages.map((message, index) =>
            message.role === "user" ? (
              <UserMessage key={message.id} message={message} index={index} />
            ) : (
              <AssistantMessage key={message.id} message={message} index={index} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function UserMessage({ message, index }: { message: ChatMessage; index: number }) {
  return (
    <article className="msg msg-user msg-in" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <p className="msg-label">You</p>
      <div className="bubble user-bubble">
        {message.code ? <pre>{message.content}</pre> : <p>{message.content}</p>}
      </div>
    </article>
  );
}

function AssistantMessage({ message, index }: { message: ChatMessage; index: number }) {
  const hazards = message.parseResult?.hazards ?? [];
  const showPills = message.pending === true && message.parseResult !== undefined && message.parseResult !== null;
  const showDetails = message.intent === "review" && message.pending !== true && hasDetails(message);
  const emptyReview = message.intent === "review" && !message.pending && message.content.trim() === "";

  return (
    <article className="msg msg-assistant msg-in" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <p className="msg-label">
        <span className="avatar" aria-hidden="true">
          L
        </span>
        Lockstep
      </p>
      <div className="bubble assistant-bubble">
        {showPills ? <HazardPills hazards={hazards} /> : null}
        {message.error ? (
          <p className="assistant-error">{message.error}</p>
        ) : message.pending === true && message.content === "" ? (
          <ThinkingBubble label={message.thinkingLabel ?? "Thinking"} />
        ) : (
          <p className="note">
            {emptyReview ? "No grounded sentences were kept." : message.content}
            {message.pending === true ? <span className="caret" aria-hidden="true" /> : null}
          </p>
        )}
        {showDetails ? <MessageDetails message={message} hazards={hazards} /> : null}
      </div>
    </article>
  );
}

function HazardPills({ hazards }: { hazards: Hazard[] }) {
  if (hazards.length === 0) {
    return (
      <p className="pills">
        <span className="pill">no hazards</span>
      </p>
    );
  }
  return (
    <p className="pills">
      {hazards.map((hazard) => (
        <span key={`${hazard.statementIndex}-${hazard.start}-${hazard.code}`} className="pill">
          {hazard.code.replaceAll("_", " ")}
        </span>
      ))}
    </p>
  );
}

function MessageDetails({ message, hazards }: { message: ChatMessage; hazards: Hazard[] }) {
  const citations = message.citations ?? [];
  const dropped = message.dropped ?? [];
  const spans = message.trace?.spans ?? [];
  return (
    <details className="details">
      <summary>
        {hazards.length} hazards · {citations.length} citations · {spans.length} spans
      </summary>
      <div className="details-body">
        <section>
          <h3>Hazards</h3>
          {hazards.length === 0 ? (
            <p className="quiet">Parser found no hazards.</p>
          ) : (
            <ul className="detail-list">
              {hazards.map((hazard) => (
                <li key={`${hazard.statementIndex}-${hazard.start}-${hazard.code}`}>
                  <span className="pill">{hazard.code.replaceAll("_", " ")}</span>
                  <span>{hazard.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3>Citations</h3>
          {citations.length === 0 ? (
            <p className="quiet">None kept.</p>
          ) : (
            <ul className="detail-list">
              {citations.map((citation) => (
                <li key={`${citation.kind}-${citation.sourceId}-${citation.quote}`}>
                  <span className="pill">
                    {citation.kind} {citation.sourceId}
                  </span>
                  <span className="quote">{citation.quote}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {dropped.length > 0 ? (
          <section>
            <h3>Dropped</h3>
            <ul className="detail-list">
              {dropped.map((sentence, index) => (
                <li key={`${index}-${sentence}`} className="quiet">
                  {sentence}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section>
          <h3>Trace</h3>
          {spans.length === 0 ? (
            <p className="quiet">No spans.</p>
          ) : (
            <p className="trace">
              {spans.map((span) => (
                <span key={span.name}>
                  {span.name} {span.durationMs.toFixed(1)}ms
                </span>
              ))}
            </p>
          )}
        </section>
      </div>
    </details>
  );
}

function hasDetails(message: ChatMessage): boolean {
  return (
    (message.citations?.length ?? 0) > 0 ||
    (message.dropped?.length ?? 0) > 0 ||
    (message.trace?.spans.length ?? 0) > 0 ||
    (message.parseResult?.hazards.length ?? 0) > 0
  );
}
