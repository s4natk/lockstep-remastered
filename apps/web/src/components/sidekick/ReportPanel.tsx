"use client";
import { useState } from "react";
import type { InvestigationReport } from "@lockstep/shared";
import { SidePanel, Icon } from "./Primitives";
import { CodeView, RichText } from "./RichText";
import { downloadFile } from "../../lib/clipboard";
export function ReportPanel({
  report,
  initialTab = "evidence",
  onClose,
}: {
  report: InvestigationReport | null;
  initialTab?: "evidence" | "report";
  onClose: () => void;
}) {
  const [tab, setTab] = useState(initialTab);
  const [selected, setSelected] = useState<string | null>(report?.evidence[0]?.id ?? null);
  const source = report?.evidence.find((item) => item.id === selected) ?? report?.evidence[0];
  const refs = (ids: string[]) => (
    <span className="ls-citations">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => {
            setSelected(id);
            setTab("evidence");
          }}
        >
          {id}
        </button>
      ))}
    </span>
  );
  return (
    <SidePanel title="Investigation details" eyebrow="REASONING YOU CAN INSPECT" onClose={onClose}>
      <div className="ls-panel-tabs" role="tablist" aria-label="Investigation details">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "evidence"}
          onClick={() => setTab("evidence")}
        >
          Evidence <span>{report?.evidence.length ?? 0}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "report"}
          onClick={() => setTab("report")}
        >
          Report
        </button>
      </div>
      {!report ? (
        <div className="ls-panel-empty">
          <Icon name="evidence" size={32} />
          <h3>The evidence will appear here.</h3>
          <p>
            Submit a failure to extract observations and trace the final response to its sources.
          </p>
        </div>
      ) : tab === "evidence" ? (
        <>
          <p className="ls-panel-lede">
            Every reference points to submitted input, your context, or retrieved guidance. A source
            reference does not prove a proposed cause.
          </p>
          {report.logEvents?.length ? (
            <section className="ls-log-timeline" aria-label="Log event timeline">
              <h3>
                Event timeline <span>{report.logEvents.length}</span>
              </h3>
              <ol>
                {report.logEvents.map((event) => (
                  <li key={event.id}>
                    <div className="ls-log-meta">
                      <span data-severity={event.severity}>{event.severity}</span>
                      {event.timestamp ? <time>{event.timestamp}</time> : null}
                      {event.service ? <strong>{event.service}</strong> : null}
                    </div>
                    <p>{event.message}</p>
                    {event.requestId || event.traceId ? (
                      <small>
                        {event.requestId ? `request: ${event.requestId}` : ""}{" "}
                        {event.traceId ? `trace: ${event.traceId}` : ""}
                      </small>
                    ) : null}
                    {event.stackFrames.length ? (
                      <ul>
                        {event.stackFrames.map((frame, index) => (
                          <li key={index}>
                            <code>
                              {frame.file}
                              {frame.line ? `:${frame.line}` : ""}
                              {frame.function ? ` ? ${frame.function}` : ""}
                            </code>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {refs(event.evidenceIds)}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          <div className="ls-sources">
            {report.evidence.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={source?.id === item.id}
                onClick={() => setSelected(item.id)}
              >
                <Icon name={item.kind === "runbook" ? "book" : "code"} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.id}</small>
                </span>
                <span className="ls-source-type">
                  {item.kind === "context"
                    ? "YOUR CONTEXT"
                    : item.kind === "runbook"
                      ? "RUNBOOK"
                      : item.kind === "sql_parser"
                        ? "PARSER"
                        : "INPUT"}
                </span>
              </button>
            ))}
          </div>
          {source ? (
            <section className="ls-source-detail" aria-label="Selected evidence">
              <div>
                <span className="ls-overline">{source.id}</span>
                {source.provenance.lineStart ? (
                  <span>
                    Line {source.provenance.lineStart}
                    {source.provenance.lineEnd &&
                    source.provenance.lineEnd !== source.provenance.lineStart
                      ? `–${source.provenance.lineEnd}`
                      : ""}
                  </span>
                ) : null}
              </div>
              <CodeView code={source.content} label={source.label} />
              <p className="ls-source-origin">
                Source: <code>{source.provenance.sourceId}</code>
              </p>
              {source.provenance.url && /^https?:\/\//.test(source.provenance.url) ? (
                <a
                  className="ls-link"
                  href={source.provenance.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open original source ↗
                </a>
              ) : null}
            </section>
          ) : null}
        </>
      ) : (
        <div className="ls-report-detail">
          <div className="ls-report-mode">
            <span className="ls-pill">
              {report.mode === "ai" ? "AI assisted" : "Deterministic analysis"}
            </span>
            <span>{report.confidence} confidence</span>
            <button
              className="ls-icon-button"
              type="button"
              aria-label="Export report JSON"
              onClick={() =>
                downloadFile(
                  `lockstep-${report.sessionId}.json`,
                  JSON.stringify(report, null, 2),
                  "application/json",
                )
              }
            >
              <Icon name="download" />
            </button>
          </div>
          <section>
            <h3>Summary</h3>
            <p>{report.summary}</p>
          </section>
          <section>
            <h3>Observed facts</h3>
            {report.observations.map((finding) => (
              <div className="ls-report-finding" key={finding.id}>
                <p>{finding.message}</p>
                {refs(finding.evidenceIds)}
              </div>
            ))}
          </section>
          <section>
            <h3>Working hypothesis</h3>
            {report.primaryHypothesis ? (
              <>
                <h4>{report.primaryHypothesis.title}</h4>
                <p>{report.primaryHypothesis.explanation}</p>
                {refs(report.primaryHypothesis.evidenceIds)}
              </>
            ) : (
              <p>There is not enough evidence to establish a likely cause.</p>
            )}
            {report.alternatives.map((item) => (
              <details key={item.id}>
                <summary>{item.title}</summary>
                <p>{item.explanation}</p>
                {refs(item.evidenceIds)}
              </details>
            ))}
          </section>
          <section>
            <h3>Remediation</h3>
            {report.remediation.map((step, index) => (
              <div key={index} className="ls-guidance">
                <span>{index + 1}</span>
                <div>
                  <h4>{step.title}</h4>
                  <RichText source={step.detail} />
                  {refs(step.evidenceIds)}
                </div>
              </div>
            ))}
          </section>
          <section>
            <h3>Verification</h3>
            {report.verification.map((step, index) => (
              <div key={index} className="ls-guidance">
                <span>{index + 1}</span>
                <div>
                  <h4>{step.title}</h4>
                  <RichText source={step.detail} />
                  {refs(step.evidenceIds)}
                </div>
              </div>
            ))}
          </section>
          <section>
            <h3>Missing information</h3>
            <ul>
              {report.missingInformation.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Limits & warnings</h3>
            <ul>
              {report.limitations.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
              {report.warnings.map((item, index) => (
                <li key={`w${index}`}>{item.message}</li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </SidePanel>
  );
}
