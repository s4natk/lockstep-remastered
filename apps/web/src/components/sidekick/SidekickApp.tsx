"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  FAILURE_KINDS,
  SIDEKICK_LIMITS,
  type FailureKind,
  type SidekickMessage,
  type InvestigationReport,
} from "@lockstep/shared";
import { useSidekick } from "../../hooks/useSidekick";
import { latestReport } from "../../lib/sidekickClient";
import { parseEnvironment } from "../../lib/investigationClient";
import { FAILURE_EXAMPLES, FAILURE_LABELS } from "../../lib/investigationExamples";
import { downloadFile } from "../../lib/clipboard";
import { AgentMark, Icon, CopyControl, SidePanel } from "./Primitives";
import { RichText } from "./RichText";
import { ReportPanel } from "./ReportPanel";
import { KnowledgePanel } from "./KnowledgePanel";
import { ServiceStatus, ResponseMode, FallbackNotice } from "./ResponseStatus";
import { TracePreview } from "./TracePreview";
const exampleCards = [
  {
    id: "python",
    icon: "bug" as const,
    tone: "rose",
    title: "Trace an exception",
    detail: "Follow the failing value through a stack trace",
  },
  {
    id: "test",
    icon: "flask" as const,
    tone: "amber",
    title: "Unblock a failing test",
    detail: "Compare the expectation with what happened",
  },
  {
    id: "http",
    icon: "pulse" as const,
    tone: "cyan",
    title: "Investigate an API error",
    detail: "Make sense of responses, limits, and timeouts",
  },
  {
    id: "sql",
    icon: "database" as const,
    tone: "violet",
    title: "Review a SQL migration",
    detail: "Find risky changes before they reach production",
  },
];
const workflow = [
  {
    icon: "code" as const,
    title: "Normalize",
    text: "Parse the failure and preserve its evidence.",
  },
  { icon: "book" as const, title: "Retrieve", text: "Search runbooks and your saved context." },
  {
    icon: "search" as const,
    title: "Investigate",
    text: "Reason with a model or deterministic guidance.",
  },
  {
    icon: "check" as const,
    title: "Validate",
    text: "Check the report and its source references.",
  },
];
const stagger = (index: number) => ({ "--i": index }) as CSSProperties;
// A pending user message is replaced by its saved copy; keying by turn keeps it mounted.
function messageKeys(messages: SidekickMessage[]) {
  const seen = new Set<string>();
  return messages.map((message) => {
    const turnKey = message.role === "user" ? `user:${message.clientTurnId}` : message.id;
    const key = seen.has(turnKey) ? message.id : turnKey;
    seen.add(key);
    return [key, message] as const;
  });
}
interface Props {
  view?: "agent" | "history" | "help";
  initialKind?: FailureKind;
}
export function SidekickApp({ view = "agent", initialKind }: Props) {
  const params = useSearchParams();
  const threadId = params.get("thread");
  const state = useSidekick(threadId);
  const [draft, setDraft] = useState("");
  const [category, setCategory] = useState<FailureKind | "auto">(initialKind ?? "auto");
  const [environment, setEnvironment] = useState("");
  const [showEnvironment, setShowEnvironment] = useState(false);
  const [panel, setPanel] = useState<"context" | "evidence" | "report" | null>(null);
  const [panelReport, setPanelReport] = useState<InvestigationReport | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const report = latestReport(state.thread);
  const running = state.busy || state.thread?.status === "running";
  useEffect(() => {
    const node = composerRef.current;
    if (node) {
      node.style.height = "auto";
      node.style.height = `${Math.min(node.scrollHeight, 210)}px`;
    }
  }, [draft]);
  useEffect(() => {
    if (nearBottom.current && state.thread?.messages.length)
      bottomRef.current?.scrollIntoView({ block: "end" });
  }, [state.thread?.messages.length, state.streaming, state.activity.length]);
  useEffect(() => {
    const example = FAILURE_EXAMPLES.find((item) => item.id === params.get("example"));
    if (example) setDraft(example.input);
  }, [params]);
  const fill = (text: string) => {
    setDraft(text);
    setLocalError(null);
    composerRef.current?.focus();
  };
  const submit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (running || state.loading) return;
    setLocalError(null);
    let context: Record<string, string> | undefined;
    try {
      context = parseEnvironment(environment);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "Check the environment details.");
      return;
    }
    nearBottom.current = true;
    const sent = await state.send(draft, category === "auto" ? undefined : category, context);
    if (sent) setDraft("");
  };
  const openReport = (value: InvestigationReport | null, tab: "evidence" | "report") => {
    setPanelReport(value);
    setPanel(tab);
  };
  const sourceCount = report?.evidence.length ?? 0;
  const railContent = (
    <>
      <Link className="ls-brand" href="/" aria-label="Lockstep workspace">
        <AgentMark size={36} />
        <span>
          lockstep<span className="ls-brand-dot">.</span>
          <small>DEBUGGING, TOGETHER.</small>
        </span>
      </Link>
      <Link
        className="ls-new-thread"
        aria-label="New investigation"
        href="/investigate"
        onClick={() => setMenuOpen(false)}
      >
        <Icon name="plus" />
        New investigation<kbd>↗</kbd>
      </Link>
      <nav className="ls-rail-nav" aria-label="Workspace navigation">
        <Link
          href="/history"
          aria-current={view === "history" ? "page" : undefined}
          onClick={() => setMenuOpen(false)}
        >
          <Icon name="history" />
          All investigations<span>{state.threads.length || ""}</span>
        </Link>
        <button
          type="button"
          onClick={() => {
            setMenuOpen(false);
            setPanel("context");
          }}
        >
          <Icon name="book" />
          Knowledge library<span>{state.documents.length || ""}</span>
        </button>
      </nav>
      <div className="ls-recent-label">
        <span>RECENT THREADS</span>
        <Icon name="message" size={13} />
      </div>
      <div className="ls-recent-threads">
        {state.threads.length ? (
          state.threads.slice(0, 15).map((item) => (
            <Link
              key={item.id}
              href={`/investigate?thread=${encodeURIComponent(item.id)}`}
              aria-current={threadId === item.id ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              <span
                className={`ls-thread-dot ${item.status === "running" ? "ls-thread-running" : ""}`}
              />
              <span>{item.title}</span>
              {item.status === "running" ? <span className="ls-sr-only">In progress</span> : null}
            </Link>
          ))
        ) : (
          <p>
            Your investigations will live here.
            <br />
            Start with an error or a question.
          </p>
        )}
      </div>
      <div className="ls-rail-bottom">
        <Link
          href="/how-it-works"
          aria-current={view === "help" ? "page" : undefined}
          onClick={() => setMenuOpen(false)}
        >
          <Icon name="help" />
          How Lockstep works
        </Link>
        <ServiceStatus connection={state.connection} report={report} />
        <p className="ls-private-note">
          <Icon name="shield" size={13} />
          Private to this browser’s access key.
        </p>
      </div>
    </>
  );
  return (
    <div className="ls-app">
      <a className="ls-skip" href="#conversation-main">
        Skip to workspace
      </a>
      <aside className="ls-rail" aria-label="Investigation sidebar">
        {railContent}
      </aside>
      {menuOpen ? (
        <SidePanel
          title="Workspace"
          eyebrow="LOCKSTEP"
          side="left"
          onClose={() => setMenuOpen(false)}
        >
          <div className="ls-mobile-rail">{railContent}</div>
        </SidePanel>
      ) : null}
      <div className="ls-workspace">
        <header className="ls-topbar">
          <button
            type="button"
            className="ls-icon-button ls-mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMenuOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <div className="ls-thread-heading">
            <span className="ls-breadcrumb">
              WORKSPACE <span>/</span>{" "}
              {view === "history" ? "HISTORY" : view === "help" ? "GUIDE" : "INVESTIGATION"}
            </span>
            <h1>
              {view === "history"
                ? "Your investigations"
                : view === "help"
                  ? "A little clarity on how this works."
                  : (state.thread?.title ?? "New investigation")}
            </h1>
          </div>
          <div className="ls-topbar-actions">
            <button type="button" className="ls-utility" onClick={() => setPanel("context")}>
              <Icon name="book" />
              <span>Context</span>
              {state.selectedIds.length ? <b>{state.selectedIds.length}</b> : null}
            </button>
            {view === "agent" ? (
              <button
                type="button"
                className="ls-utility"
                onClick={() => openReport(report, "evidence")}
              >
                <Icon name="evidence" />
                <span>Evidence</span>
                {sourceCount ? <b>{sourceCount}</b> : null}
              </button>
            ) : null}
          </div>
        </header>
        <main className="ls-main" id="conversation-main">
          {state.busy ? <div className="ls-progress" aria-hidden="true" /> : null}
          {view === "history" ? (
            <div className="ls-history-view">
              <div className="ls-page-heading">
                <div>
                  <span className="ls-overline">THE WORK SO FAR</span>
                  <h2>Keep the whole investigation.</h2>
                  <p>Conversations, context, and evidence. Ready when you come back.</p>
                </div>
                <Link className="ls-button ls-button-primary" href="/investigate">
                  <Icon name="plus" />
                  New investigation
                </Link>
              </div>
              <div className="ls-history-tools">
                <label className="ls-search">
                  <Icon name="search" />
                  <input
                    value={historyQuery}
                    onChange={(event) => setHistoryQuery(event.target.value)}
                    aria-label="Search investigations"
                    placeholder="Find an investigation…"
                  />
                </label>
                <button
                  className="ls-icon-button"
                  type="button"
                  aria-label="Refresh history"
                  onClick={() => void state.refreshLists()}
                >
                  <Icon name="refresh" />
                </button>
              </div>
              <p className="ls-history-note">
                History is private to this browser. Clearing site storage loses its access key.
              </p>
              {state.error ? (
                <div className="ls-alert" role="alert">
                  {state.error}
                </div>
              ) : null}
              {state.threads.length === 0 ? (
                <div className="ls-history-empty">
                  <span className="ls-history-empty-icon">
                    <Icon name="message" size={28} />
                  </span>
                  <h3>A fresh page, for now.</h3>
                  <p>Your first investigation will appear here with its full conversation.</p>
                  <Link className="ls-button ls-button-primary" href="/investigate">
                    Start investigating
                  </Link>
                </div>
              ) : (
                <div className="ls-history-list">
                  {state.threads
                    .filter((item) =>
                      `${item.title} ${item.lastPreview}`
                        .toLowerCase()
                        .includes(historyQuery.toLowerCase()),
                    )
                    .map((item, index) => (
                      <article key={item.id} style={stagger(index)}>
                        <Link href={`/investigate?thread=${encodeURIComponent(item.id)}`}>
                          <div>
                            <span className="ls-category-label" data-kind={item.kind}>
                              {FAILURE_LABELS[item.kind]}
                            </span>
                            <time dateTime={item.updatedAt}>
                              {new Date(item.updatedAt).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}
                            </time>
                          </div>
                          <h3>{item.title}</h3>
                          <p>{item.lastPreview || "No messages yet."}</p>
                          <small>
                            {item.status === "running" ? "Turn in progress" : "Open conversation"}
                            <Icon name="arrowRight" size={15} />
                          </small>
                        </Link>
                        <div className="ls-history-delete">
                          {deleteId === item.id ? (
                            <>
                              <span>Delete this thread?</span>
                              <button
                                type="button"
                                className="ls-text-button ls-danger"
                                disabled={deleting}
                                onClick={() => {
                                  setDeleting(true);
                                  void state
                                    .removeThread(item.id)
                                    .then(() => setDeleteId(null))
                                    .catch((cause) =>
                                      setLocalError(
                                        cause instanceof Error
                                          ? cause.message
                                          : "Could not delete the thread.",
                                      ),
                                    )
                                    .finally(() => setDeleting(false));
                                }}
                              >
                                Delete
                              </button>
                              <button
                                className="ls-text-button"
                                type="button"
                                onClick={() => setDeleteId(null)}
                              >
                                Keep
                              </button>
                            </>
                          ) : (
                            <button
                              className="ls-icon-button"
                              type="button"
                              aria-label={`Delete investigation ${item.title}`}
                              onClick={() => setDeleteId(item.id)}
                            >
                              <Icon name="trash" size={16} />
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                </div>
              )}
              {localError ? (
                <div role="alert" className="ls-alert">
                  {localError}
                </div>
              ) : null}
            </div>
          ) : view === "help" ? (
            <div className="ls-help-view">
              <span className="ls-overline">AN INVESTIGATION PARTNER, WITH RECEIPTS.</span>
              <h2>
                Start with the failure.
                <br />
                <span>Keep asking better questions.</span>
              </h2>
              <p className="ls-help-intro">
                Lockstep helps you trace errors, weigh explanations, and choose the next thing to
                test. The conversation keeps your evidence in reach.
              </p>
              <ol className="ls-help-flow" aria-label="How each turn is handled">
                {workflow.map((step, index) => (
                  <li key={step.title} style={stagger(index)}>
                    <span>
                      <Icon name={step.icon} />
                    </span>
                    <strong>{step.title}</strong>
                    <small>{step.text}</small>
                  </li>
                ))}
              </ol>
              <p className="ls-help-flow-note">
                PostgreSQL migrations add a Rust/WebAssembly hazard analysis before retrieval.
              </p>
              {[
                {
                  title: "One thread. The whole problem.",
                  text: "Paste a runtime exception, failed test, HTTP response, logs, database error, or SQL migration. Follow up with code, questions, or new evidence. Each turn keeps the incident’s conversation and selected sources available.",
                },
                {
                  title: "Bring context that belongs to your system.",
                  text: "Save UTF-8 docs, code, logs, or notes in your private knowledge library. Select up to 12 sources for a thread. Keyword retrieval works without vector infrastructure; semantic retrieval is optional and labelled when available.",
                },
                {
                  title: "Watch the work, then check the evidence.",
                  text: "Progress follows actual parsing, retrieval, and validation stages. Any streaming draft is provisional. The final response replaces it after validation; the evidence panel links findings to their sources. A valid reference identifies evidence, not proof of a claim.",
                },
                {
                  title: "Useful even when AI is unavailable.",
                  text: "Deterministic mode uses parsed evidence and curated guidance. AI responses require a successful provider request. Each reply shows the mode actually used, with missing context and limitations available in its report.",
                },
                {
                  title: "A workspace you can return to.",
                  text: "Threads and knowledge are saved by the backend under a browser-generated access key. Clearing browser storage loses access. Export a thread or report before clearing storage; delete unwanted threads and sources from their library views.",
                },
                {
                  title: "Your code stays data.",
                  text: "Lockstep never executes your submitted code, SQL, or shell commands. Remove credentials and personal information before submitting. Input and selected context are sent to the backend and, when enabled, the model provider. Verify every suggested change in your own environment.",
                },
              ].map((item, index) => (
                <section key={item.title} style={stagger(index)}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </div>
                </section>
              ))}
              <Link href="/investigate" className="ls-button ls-button-primary">
                Open an investigation
                <Icon name="arrowRight" />
              </Link>
            </div>
          ) : (
            <>
              <div
                className="ls-conversation-scroll"
                ref={scrollRef}
                onScroll={() => {
                  const node = scrollRef.current;
                  if (node)
                    nearBottom.current =
                      node.scrollHeight - node.scrollTop - node.clientHeight < 180;
                }}
              >
                {state.loading ? (
                  <div role="status" className="ls-loading-thread">
                    <span className="ls-spinner" />
                    Opening your investigation…
                  </div>
                ) : state.thread?.messages.length ? (
                  <div className="ls-conversation">
                    <div className="ls-thread-date">
                      <span />
                      {new Date(state.thread.createdAt).toLocaleDateString(undefined, {
                        month: "long",
                        day: "numeric",
                      })}
                      <span />
                    </div>
                    {messageKeys(state.thread.messages).map(([key, message]) => (
                      <Message
                        key={key}
                        message={message}
                        pending={state.busy && message.id.startsWith("pending-")}
                        onReport={openReport}
                      />
                    ))}
                    {!state.busy && state.thread.status !== "running" ? (
                      <div className="ls-followups" aria-label="Suggested follow-up questions">
                        {[
                          "What should I check first?",
                          "How can I verify the fix?",
                          "What other causes fit?",
                        ].map((text, index) => (
                          <button
                            type="button"
                            key={text}
                            style={stagger(index)}
                            onClick={() => fill(text)}
                          >
                            {text}
                            <span>↗</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="ls-welcome">
                    <div className="ls-aurora" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="ls-welcome-mark">
                      <AgentMark size={46} motion="intro" />
                      <span className="ls-overline">LET’S WORK THE PROBLEM.</span>
                    </div>
                    <h2>
                      What are we
                      <br />
                      <span>investigating?</span>
                    </h2>
                    <p>
                      Bring an error, a failing test, or the logs that don’t add up. We’ll follow
                      the evidence and work out the next step.
                    </p>
                    <TracePreview />
                    <div
                      className="ls-example-grid"
                      onPointerMove={(event) => {
                        const card = (event.target as Element).closest<HTMLElement>("button");
                        if (!card) return;
                        const box = card.getBoundingClientRect();
                        card.style.setProperty("--mx", `${event.clientX - box.left}px`);
                        card.style.setProperty("--my", `${event.clientY - box.top}px`);
                      }}
                    >
                      {exampleCards.map((card, index) => (
                        <button
                          key={card.id}
                          type="button"
                          data-tone={card.tone}
                          style={stagger(index)}
                          onClick={() => {
                            const example = FAILURE_EXAMPLES.find((item) => item.id === card.id);
                            if (example) {
                              setCategory(example.kind);
                              fill(example.input);
                            }
                          }}
                        >
                          <span className="ls-example-icon">
                            <Icon name={card.icon} />
                          </span>
                          <strong>{card.title}</strong>
                          <span>{card.detail}</span>
                          <i>
                            <Icon name="arrowRight" size={16} />
                          </i>
                        </button>
                      ))}
                    </div>
                    <div className="ls-welcome-context">
                      <Icon name="book" size={16} />
                      <span>Have a runbook or relevant code?</span>
                      <button type="button" onClick={() => setPanel("context")}>
                        Give Lockstep some context <span>↗</span>
                      </button>
                    </div>
                  </div>
                )}
                {state.busy ? (
                  <div className="ls-conversation ls-live-turn">
                    <div className="ls-assistant-heading">
                      <span className="ls-avatar ls-agent-avatar">
                        <AgentMark size={30} motion="working" />
                      </span>
                      <strong>Lockstep</strong>
                      <span className="ls-live-label">
                        <span className="ls-spinner" />
                        <span className="ls-live-text" key={state.activity.length}>
                          {state.activity.at(-1)?.message ?? "Opening the investigation…"}
                        </span>
                      </span>
                    </div>
                    {state.streaming ? (
                      <>
                        <div className="ls-provisional-label">
                          STREAMING DRAFT · NOT YET VALIDATED
                        </div>
                        <RichText source={state.streaming} />
                      </>
                    ) : null}
                    {state.activity.length > 0 ? (
                      <details className="ls-activity">
                        <summary>
                          Investigation activity <span>{state.activity.length} stages</span>
                          <Icon name="chevron" size={15} />
                        </summary>
                        <ol>
                          {state.activity.map((item, index) => (
                            <li key={item.stage}>
                              {index === state.activity.length - 1 ? (
                                <span className="ls-spinner" />
                              ) : (
                                <Icon name="check" size={13} />
                              )}
                              <span>{item.message}</span>
                            </li>
                          ))}
                        </ol>
                      </details>
                    ) : null}
                  </div>
                ) : null}
                {state.thread?.status === "running" && !state.busy ? (
                  <div className="ls-recovery-banner" role="status">
                    <strong>This thread has a turn in progress.</strong>
                    <p>
                      The connection may have ended before the final response arrived. Refresh to
                      recover it, or stop the interrupted turn.
                    </p>
                    <div>
                      <button
                        className="ls-button ls-button-outline"
                        type="button"
                        onClick={() => void state.recover()}
                      >
                        <Icon name="refresh" />
                        Refresh thread
                      </button>
                      <button
                        className="ls-button ls-button-outline"
                        type="button"
                        onClick={() => void state.stop()}
                      >
                        <Icon name="stop" />
                        Stop interrupted turn
                      </button>
                    </div>
                  </div>
                ) : null}
                <div ref={bottomRef} />
              </div>
              <div className="ls-composer-area">
                {state.error || localError ? (
                  <div className="ls-composer-error" role="alert">
                    <Icon name="help" size={16} />
                    <span>{localError ?? state.error}</span>
                    {state.thread ? (
                      <button type="button" onClick={() => void state.recover()}>
                        Refresh thread
                      </button>
                    ) : null}
                    <button
                      className="ls-icon-button"
                      type="button"
                      aria-label="Dismiss error"
                      onClick={() => {
                        setLocalError(null);
                        state.clearError();
                      }}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                ) : null}
                <form className="ls-composer" onSubmit={(event) => void submit(event)}>
                  <label className="ls-sr-only" htmlFor="sidekick-message">
                    Message Lockstep
                  </label>
                  <textarea
                    id="sidekick-message"
                    ref={composerRef}
                    value={draft}
                    disabled={running || state.loading}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={
                      state.thread
                        ? "Add more evidence, or ask a follow-up…"
                        : "Paste an error, share the logs, or ask a question…"
                    }
                    rows={2}
                    spellCheck={false}
                    aria-describedby="composer-privacy"
                    aria-invalid={draft.length > SIDEKICK_LIMITS.message}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        void submit();
                      }
                    }}
                  />
                  {showEnvironment ? (
                    <div className="ls-composer-environment">
                      <label htmlFor="agent-environment">
                        Environment · one KEY=value per line
                      </label>
                      <textarea
                        id="agent-environment"
                        value={environment}
                        onChange={(event) => setEnvironment(event.target.value)}
                        placeholder={"runtime=Node.js 24\nframework=Next.js"}
                        rows={2}
                        disabled={running}
                      />
                    </div>
                  ) : null}
                  <div className="ls-composer-controls">
                    <div className="ls-compose-tools">
                      <button
                        type="button"
                        className="ls-icon-button"
                        aria-label="Add context"
                        title="Add context"
                        disabled={running}
                        onClick={() => setPanel("context")}
                      >
                        <Icon name="attach" />
                      </button>
                      <label className="ls-kind-select">
                        <Icon name="code" size={14} />
                        <span className="ls-sr-only">Failure category</span>
                        <select
                          aria-label="Failure category"
                          value={category}
                          disabled={running}
                          onChange={(event) =>
                            setCategory(event.target.value as FailureKind | "auto")
                          }
                        >
                          <option value="auto">Auto detect</option>
                          {FAILURE_KINDS.map((kind) => (
                            <option value={kind} key={kind}>
                              {FAILURE_LABELS[kind]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="ls-environment-toggle"
                        aria-expanded={showEnvironment}
                        onClick={() => setShowEnvironment(!showEnvironment)}
                      >
                        Environment{environment.trim() ? " · set" : ""}
                      </button>
                      {state.selectedIds.length ? (
                        <button
                          type="button"
                          className="ls-context-chip"
                          onClick={() => setPanel("context")}
                        >
                          <Icon name="book" size={12} />
                          {state.selectedIds.length} sources
                        </button>
                      ) : null}
                    </div>
                    {running ? (
                      <button
                        key="stop"
                        type="button"
                        className="ls-send ls-stop"
                        aria-label="Stop investigation"
                        onClick={(event) => {
                          event.preventDefault();
                          void state.stop();
                        }}
                      >
                        <Icon name="stop" />
                      </button>
                    ) : (
                      <button
                        key="send"
                        type="submit"
                        className="ls-send"
                        aria-label="Send message"
                        disabled={!draft.trim() || state.loading}
                      >
                        <Icon name="arrow" />
                      </button>
                    )}
                  </div>
                </form>
                <div className="ls-composer-foot">
                  <p id="composer-privacy">
                    Remove secrets before sending. Verify suggestions before applying them.
                  </p>
                  <span>
                    {draft.length > 1000
                      ? `${draft.length.toLocaleString()} / 32,768`
                      : "Enter to send · Shift + Enter for a new line"}
                  </span>
                </div>
              </div>
            </>
          )}
        </main>
        {state.thread && view === "agent" ? (
          <button
            className="ls-export-thread"
            type="button"
            onClick={() =>
              downloadFile(
                `lockstep-thread-${state.thread!.id}.json`,
                JSON.stringify(state.thread, null, 2),
                "application/json",
              )
            }
            aria-label="Export conversation"
            title="Export conversation"
          >
            <Icon name="download" size={14} />
          </button>
        ) : null}
      </div>
      {panel === "context" ? (
        <KnowledgePanel
          documents={state.documents}
          selectedIds={state.selectedIds}
          busy={running}
          onSelect={state.selectContext}
          onAdded={state.added}
          onDelete={state.removeDocument}
          onClose={() => setPanel(null)}
        />
      ) : panel ? (
        <ReportPanel
          key={panelReport?.sessionId ?? "empty"}
          report={panelReport}
          initialTab={panel}
          onClose={() => setPanel(null)}
        />
      ) : null}
    </div>
  );
}
function Message({
  message,
  pending,
  onReport,
}: {
  message: SidekickMessage;
  pending: boolean;
  onReport: (report: InvestigationReport | null, tab: "evidence" | "report") => void;
}) {
  if (message.role === "user")
    return (
      <article className="ls-message ls-user-turn">
        <div className="ls-message-heading">
          <span className="ls-avatar ls-user-avatar">Y</span>
          <strong>You</strong>
          <span>
            {pending
              ? "Submitting…"
              : new Date(message.createdAt).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
          </span>
        </div>
        <div className="ls-user-content">
          <pre>{message.content}</pre>
          {message.contextIds?.length ? (
            <span className="ls-user-context">
              <Icon name="book" size={12} />
              {message.contextIds.length} context sources attached
            </span>
          ) : null}
        </div>
      </article>
    );
  return (
    <article className="ls-message ls-assistant-turn" data-status={message.status}>
      <div className="ls-message-heading">
        <span className="ls-avatar ls-agent-avatar">
          <AgentMark size={30} />
        </span>
        <strong>Lockstep</strong>
        <ResponseMode report={message.report} mode={message.mode} status={message.status} />
        <CopyControl text={message.content} />
      </div>
      <div className="ls-answer-content">
        <RichText source={message.content} />
        {message.status !== "complete" ? (
          <div className="ls-message-interrupted">
            {message.status === "cancelled"
              ? "This turn was stopped. Add evidence or retry with a new message."
              : "This turn did not finish. Your evidence is still saved in this thread."}
          </div>
        ) : null}
        {message.status === "complete" ? <FallbackNotice report={message.report} /> : null}
        {message.report ? (
          <div className="ls-answer-tools">
            <button type="button" onClick={() => onReport(message.report ?? null, "evidence")}>
              <Icon name="evidence" size={14} />
              Inspect {message.report.evidence.length} sources
            </button>
            <button type="button" onClick={() => onReport(message.report ?? null, "report")}>
              <Icon name="code" size={14} />
              Structured report
            </button>
            <span>References checked</span>
          </div>
        ) : null}
      </div>
    </article>
  );
}
