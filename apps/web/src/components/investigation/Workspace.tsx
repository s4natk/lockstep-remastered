"use client";

import {
  FAILURE_KINDS,
  INPUT_LIMITS,
  InvestigationValidationError,
  validateInvestigationInput,
  type FailureKind,
  type InvestigationReport,
  type WorkflowStage,
} from "@lockstep/shared";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  fetchInvestigation,
  investigationErrorMessage,
  InvestigationClientError,
  parseEnvironment,
  submitInvestigation,
  type ProgressEvent,
} from "../../lib/investigationClient";
import { FAILURE_EXAMPLES, FAILURE_LABELS } from "../../lib/investigationExamples";
import { AppFrame, Arrow } from "./AppFrame";
import { ReportView } from "./ReportView";
import { ExamplePicker } from "./ExamplePicker";

const PIPELINE: { stage: WorkflowStage; label: string }[] = [
  { stage: "validating", label: "Validate input" },
  { stage: "parsing", label: "Extract facts" },
  { stage: "retrieving", label: "Retrieve context" },
  { stage: "investigating", label: "Investigate causes" },
  { stage: "validating_evidence", label: "Validate evidence" },
  { stage: "persisting", label: "Save report" },
];
type WorkspaceState = "idle" | "loading" | "running" | "complete" | "cancelled" | "error";

export function Workspace() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [rawInput, setRawInput] = useState("");
  const [description, setDescription] = useState("");
  const [environment, setEnvironment] = useState("");
  const [category, setCategory] = useState<FailureKind | "auto">("auto");
  const [exampleId, setExampleId] = useState("");
  const [state, setState] = useState<WorkspaceState>("idle");
  const [progress, setProgress] = useState<ProgressEvent[]>([]);
  const [report, setReport] = useState<InvestigationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busy = state === "running" || state === "loading";

  const chooseExample = (id: string) => {
    const example = FAILURE_EXAMPLES.find((item) => item.id === id);
    setExampleId(id);
    if (!example) return;
    setRawInput(example.input);
    setDescription(example.description);
    setCategory("auto");
    setError(null);
  };

  useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    const params = new URLSearchParams(query);
    const example = FAILURE_EXAMPLES.find((item) => item.id === params.get("example"));
    if (example) {
      setRawInput(example.input);
      setDescription(example.description);
      setExampleId(example.id);
      setCategory("auto");
    }
    const kind = params.get("kind");
    if (kind && (FAILURE_KINDS as readonly string[]).includes(kind))
      setCategory(kind as FailureKind);
    const id = params.get("id");
    if (!id) {
      setReport(null);
      setState("idle");
      setError(null);
      setProgress([]);
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setState("loading");
    setError(null);
    setReport(null);
    void fetchInvestigation(id, controller.signal)
      .then((saved) => {
        if (!controller.signal.aborted) {
          setReport(saved);
          setState("complete");
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(investigationErrorMessage(cause));
          setState("error");
        }
      });
    return () => controller.abort();
  }, [query]);

  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (state === "complete" && report) reportRef.current?.focus();
  }, [state, report]);

  const investigate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    let input;
    try {
      input = validateInvestigationInput({
        schemaVersion: 1,
        rawInput,
        description: description.trim() || undefined,
        environment: parseEnvironment(environment),
        requestedKind: category === "auto" ? undefined : category,
      });
    } catch (cause) {
      setError(
        cause instanceof InvestigationValidationError || cause instanceof InvestigationClientError
          ? cause.message
          : "Check your input and try again.",
      );
      inputRef.current?.focus();
      return;
    }
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 120_000);
    setReport(null);
    setProgress([]);
    setState("running");
    try {
      const result = await submitInvestigation(input, controller.signal, (next) => {
        if (!controller.signal.aborted)
          setProgress((current) => [...current.filter((item) => item.stage !== next.stage), next]);
      });
      if (!controller.signal.aborted && requestRef.current === controller) {
        setReport(result);
        setState("complete");
      }
    } catch (cause) {
      if (requestRef.current !== controller) return;
      if (controller.signal.aborted && !timedOut) setState("cancelled");
      else {
        setState("error");
        setError(
          timedOut
            ? "The investigation took longer than two minutes. Check History for a saved result, or try a smaller excerpt."
            : investigationErrorMessage(cause),
        );
      }
    } finally {
      window.clearTimeout(timer);
    }
  };
  const cancel = () => {
    requestRef.current?.abort();
    setState("cancelled");
  };
  const currentProgress = progress.at(-1);
  const remaining = INPUT_LIMITS.rawInput - rawInput.length;

  return (
    <AppFrame wide>
      <div className="page-intro workspace-intro">
        <div>
          <p className="eyebrow">INVESTIGATION WORKSPACE</p>
          <h1>Let’s find the next step.</h1>
          <p>Start with the failure. Build an explanation from the evidence.</p>
        </div>
        <span className="workspace-version">EVIDENCE → EXPLANATION → ACTION</span>
      </div>
      <div className="intake-grid">
        <section className="intake-panel" aria-labelledby="intake-heading">
          <div className="panel-heading">
            <div>
              <span className="panel-step">01 / INPUT</span>
              <h2 id="intake-heading">What went wrong?</h2>
            </div>
            <span className="input-private-label">
              <span className="status-dot" /> Private history
            </span>
          </div>
          <form onSubmit={(event) => void investigate(event)} noValidate>
            <div className="intake-selectors">
              <div className="field">
                <label htmlFor="failure-category">Failure category</label>
                <select
                  id="failure-category"
                  value={category}
                  disabled={busy}
                  onChange={(event) => setCategory(event.target.value as FailureKind | "auto")}
                >
                  <option value="auto">Detect automatically</option>
                  {FAILURE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {FAILURE_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </div>
              <ExamplePicker value={exampleId} disabled={busy} onChange={chooseExample} />
            </div>
            <div className="field failure-editor-field">
              <div className="field-label-row">
                <label htmlFor="failure-input">
                  Error, stack trace, logs, or SQL <span className="required-label">Required</span>
                </label>
                <button
                  className="text-action"
                  type="button"
                  disabled={busy || !rawInput}
                  onClick={() => {
                    setRawInput("");
                    setExampleId("");
                    inputRef.current?.focus();
                  }}
                >
                  Clear
                </button>
              </div>
              <textarea
                id="failure-input"
                ref={inputRef}
                value={rawInput}
                onChange={(event) => {
                  setRawInput(event.target.value);
                  setExampleId("");
                }}
                placeholder={
                  "Paste the original error here…\n\nInclude the full message, stack trace, or a few\nsurrounding log lines."
                }
                disabled={busy}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                aria-describedby="failure-input-help failure-input-count"
                aria-invalid={remaining < 0 || Boolean(error)}
              />
              <div className="editor-foot">
                <span id="failure-input-help">
                  Source text stays intact for evidence references.
                </span>
                <span id="failure-input-count" className={remaining < 0 ? "input-over-limit" : ""}>
                  {rawInput.length.toLocaleString()} / {INPUT_LIMITS.rawInput.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="field">
              <label htmlFor="failure-description">
                What were you trying to do? <span className="optional-label">Optional</span>
              </label>
              <textarea
                id="failure-description"
                className="description-input"
                value={description}
                maxLength={INPUT_LIMITS.description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={busy}
                placeholder="For example: the checkout endpoint started returning 500 after the last deployment."
                rows={2}
              />
            </div>
            <details className="environment-details">
              <summary>
                Environment details <span className="optional-label">Optional</span>
                <span aria-hidden="true">+</span>
              </summary>
              <div className="field">
                <label htmlFor="failure-environment">
                  Runtime, framework, or deployment context
                </label>
                <textarea
                  id="failure-environment"
                  className="environment-input"
                  value={environment}
                  onChange={(event) => setEnvironment(event.target.value)}
                  disabled={busy}
                  placeholder={"runtime=Python 3.12\nframework=FastAPI\nenvironment=staging"}
                  rows={3}
                  aria-describedby="environment-help"
                />
                <p id="environment-help" className="field-help">
                  Use one KEY=value pair per line. Include non-secret context only.
                </p>
              </div>
            </details>
            {error ? (
              <div className="notice notice-error intake-error" role="alert">
                <strong>
                  {state === "error" ? "Investigation could not finish" : "Check your submission"}
                </strong>
                <span>{error}</span>
              </div>
            ) : null}
            {state === "cancelled" ? (
              <div className="notice notice-neutral intake-error" role="status">
                <strong>Investigation cancelled</strong>
                <span>
                  Your input is ready to edit and submit again. If the report finished just before
                  cancellation, it may appear in History.
                </span>
              </div>
            ) : null}
            <div className="intake-actions">
              <p>
                Remove credentials and personal information before submitting. Input is sent to the
                backend and, when enabled, the model provider.
              </p>
              {busy ? (
                <button
                  key="cancel"
                  type="button"
                  className="action action-secondary"
                  onClick={(event) => {
                    event.preventDefault();
                    cancel();
                  }}
                >
                  Cancel investigation <span aria-hidden="true">×</span>
                </button>
              ) : (
                <button key="submit" className="action action-primary" type="submit">
                  Investigate failure <Arrow />
                </button>
              )}
            </div>
          </form>
        </section>
        <aside className="intake-aside">
          <section className="investigation-progress" aria-labelledby="progress-heading">
            <div className="progress-heading">
              <span className="panel-step">02 / INVESTIGATE</span>
              <h2 id="progress-heading">Follow the evidence.</h2>
              <p>A structured workflow, from the first fact to a practical next step.</p>
            </div>
            <ol className="pipeline-list">
              {PIPELINE.map((step, index) => {
                const received = progress.some((item) => item.stage === step.stage);
                const active = state === "running" && currentProgress?.stage === step.stage;
                const complete = received && !active && state !== "cancelled" && state !== "error";
                return (
                  <li
                    key={step.stage}
                    data-state={active ? "active" : complete ? "complete" : "pending"}
                  >
                    <span className="pipeline-indicator" aria-hidden="true">
                      {complete ? "✓" : String(index + 1).padStart(2, "0")}
                    </span>
                    <span>
                      {step.label}
                      {active ? <small>In progress</small> : null}
                    </span>
                  </li>
                );
              })}
            </ol>
            <div className="progress-live" role="status" aria-live="polite">
              {busy ? (
                <>
                  <span className="loading-spinner" />
                  {state === "loading"
                    ? "Loading saved investigation…"
                    : (currentProgress?.message ?? "Connecting to the investigation service…")}
                </>
              ) : state === "complete" ? (
                <>
                  <span className="status-dot" />
                  Report ready. Review the evidence below.
                </>
              ) : state === "cancelled" ? (
                "Investigation stopped."
              ) : (
                "The workflow starts when you submit a failure."
              )}
            </div>
          </section>
          <section className="context-tip">
            <span className="mono-label">A STRONGER START</span>
            <h3>Give the investigation something to work with.</h3>
            <ul>
              <li>The complete error message</li>
              <li>The failing stack frame or assertion</li>
              <li>A few surrounding log lines</li>
              <li>What changed and what you expected</li>
            </ul>
            <p>
              Lockstep does not run your code or apply fixes. Verify recommendations in your
              environment.
            </p>
          </section>
        </aside>
      </div>
      {report ? (
        <div ref={reportRef} tabIndex={-1} className="report-focus-target">
          <ReportView key={report.sessionId} report={report} />
        </div>
      ) : null}
    </AppFrame>
  );
}
