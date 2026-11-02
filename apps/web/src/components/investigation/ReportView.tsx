"use client";

import type { GuidanceStep, InvestigationReport } from "@lockstep/shared";
import { useState } from "react";
import { FAILURE_LABELS } from "../../lib/investigationExamples";
import { EvidenceInspector } from "./EvidenceInspector";

function EvidenceReferences({ ids, onSelect }: { ids: string[]; onSelect: (id: string) => void }) {
  return ids.length ? (
    <span className="evidence-references" aria-label="Supporting evidence">
      {ids.map((id) => (
        <button
          type="button"
          key={id}
          onClick={() => onSelect(id)}
          title={`Inspect evidence ${id}`}
        >
          [{id}]
        </button>
      ))}
    </span>
  ) : null;
}
function Guidance({ steps, onSelect }: { steps: GuidanceStep[]; onSelect: (id: string) => void }) {
  return steps.length ? (
    <ol className="guidance-list">
      {steps.map((step, index) => (
        <li key={`${index}-${step.title}`}>
          <span className="guidance-number">{index + 1}</span>
          <div>
            <h4>{step.title}</h4>
            <p>{step.detail}</p>
            <EvidenceReferences ids={step.evidenceIds} onSelect={onSelect} />
          </div>
        </li>
      ))}
    </ol>
  ) : (
    <p className="subtle">More evidence is needed to recommend a specific next step.</p>
  );
}
function exportReport(report: InvestigationReport) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `lockstep-${report.sessionId}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ReportView({ report }: { report: InvestigationReport }) {
  const [selection, setSelection] = useState({ id: report.evidence[0]?.id ?? null, request: 0 });
  const selectEvidence = (id: string) =>
    setSelection((current) => ({ id, request: current.request + 1 }));
  return (
    <section className="report-workspace" aria-label="Investigation results">
      <header className="report-header">
        <div>
          <p className="eyebrow">INVESTIGATION REPORT</p>
          <h2>A clearer picture of the failure.</h2>
          <div className="report-meta">
            <span className="category-tag">{FAILURE_LABELS[report.kind]}</span>
            <span>
              {report.mode === "ai" ? "AI-assisted investigation" : "Deterministic analysis"}
            </span>
            <span className="complete-label">
              <span className="status-dot" /> Complete
            </span>
          </div>
        </div>
        <button
          className="action action-secondary"
          type="button"
          onClick={() => exportReport(report)}
        >
          Export JSON <span aria-hidden="true">↓</span>
        </button>
      </header>
      {report.mode === "deterministic" ? (
        <div className="notice notice-neutral" role="status">
          <strong>Deterministic analysis</strong>
          <span>
            This report uses parsed facts and curated guidance. AI-generated diagnosis was
            unavailable; review the limitations before acting.
          </span>
        </div>
      ) : null}
      <div className="report-columns">
        <div className="report-body">
          <section className="report-section">
            <div className="report-section-label">
              <span>01</span>
              <h3>Summary</h3>
            </div>
            <p className="report-summary">{report.summary}</p>
          </section>
          <section className="report-section">
            <div className="report-section-label">
              <span>02</span>
              <h3>Observed evidence</h3>
            </div>
            {report.observations.length ? (
              <ul className="finding-list">
                {report.observations.map((finding) => (
                  <li key={finding.id}>
                    <span className="finding-marker" aria-hidden="true" />
                    <div>
                      <p>{finding.message}</p>
                      <EvidenceReferences ids={finding.evidenceIds} onSelect={selectEvidence} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="subtle">
                No reliable facts could be extracted. Add the full error message and its surrounding
                context.
              </p>
            )}
          </section>
          <section className="report-section">
            <div className="report-section-label">
              <span>03</span>
              <h3>Working hypothesis</h3>
              <span className="confidence-tag">{report.confidence} confidence</span>
            </div>
            {report.primaryHypothesis ? (
              <div className="primary-hypothesis">
                <h4>{report.primaryHypothesis.title}</h4>
                <p>{report.primaryHypothesis.explanation}</p>
                <EvidenceReferences
                  ids={report.primaryHypothesis.evidenceIds}
                  onSelect={selectEvidence}
                />
              </div>
            ) : (
              <p className="subtle">
                The available evidence does not support a specific root-cause hypothesis.
              </p>
            )}
            {report.alternatives.length ? (
              <div className="alternative-hypotheses">
                <h4>Other explanations to consider</h4>
                {report.alternatives.map((hypothesis) => (
                  <div key={hypothesis.id}>
                    <h5>{hypothesis.title}</h5>
                    <p>{hypothesis.explanation}</p>
                    <EvidenceReferences ids={hypothesis.evidenceIds} onSelect={selectEvidence} />
                  </div>
                ))}
              </div>
            ) : null}
          </section>
          <section className="report-section">
            <div className="report-section-label">
              <span>04</span>
              <h3>Recommended remediation</h3>
            </div>
            <Guidance steps={report.remediation} onSelect={selectEvidence} />
          </section>
          <section className="report-section">
            <div className="report-section-label">
              <span>05</span>
              <h3>Verify the fix</h3>
            </div>
            <Guidance steps={report.verification} onSelect={selectEvidence} />
          </section>
          <section className="report-section">
            <div className="report-section-label">
              <span>06</span>
              <h3>Missing context & limitations</h3>
            </div>
            {report.missingInformation.length ? (
              <>
                <h4 className="small-heading">What would strengthen this investigation</h4>
                <ul className="plain-list">
                  {report.missingInformation.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {report.limitations.length ? (
              <>
                <h4 className="small-heading">Limits of this result</h4>
                <ul className="plain-list">
                  {report.limitations.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="subtle">
                Validate the proposed explanation in your environment before applying changes.
              </p>
            )}
            {report.warnings.length ? (
              <div className="parsing-warnings">
                <h4 className="small-heading">Parsing & validation notes</h4>
                {report.warnings.map((warning, index) => (
                  <p key={`${warning.code}-${index}`}>{warning.message}</p>
                ))}
              </div>
            ) : null}
          </section>
          <div className="report-footnote">
            <span>
              Investigation <code>{report.sessionId}</code>
            </span>
            <time dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleString()}</time>
          </div>
        </div>
        <EvidenceInspector
          evidence={report.evidence}
          selectedId={selection.id}
          focusRequest={selection.request}
          onSelect={selectEvidence}
        />
      </div>
    </section>
  );
}
