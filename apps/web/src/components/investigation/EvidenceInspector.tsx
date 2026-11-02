"use client";

import type { Evidence } from "@lockstep/shared";
import { useEffect, useRef } from "react";

export function EvidenceInspector({
  evidence,
  selectedId,
  focusRequest = 0,
  onSelect,
}: {
  evidence: Evidence[];
  selectedId: string | null;
  focusRequest?: number;
  onSelect: (id: string) => void;
}) {
  const selected = evidence.find((item) => item.id === selectedId) ?? evidence[0];
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusRequest > 0 && selectedId) contentRef.current?.focus();
  }, [selectedId, focusRequest]);
  let sourceUrl: string | null = null;
  if (selected?.provenance.url) {
    try {
      const url = new URL(selected.provenance.url);
      if (url.protocol === "https:" || url.protocol === "http:") sourceUrl = url.toString();
    } catch {
      /* A malformed source URL remains plain text. */
    }
  }
  return (
    <aside className="evidence-inspector" aria-labelledby="evidence-heading">
      <div className="inspector-heading">
        <span className="eyebrow">TRACE THE REASONING</span>
        <h2 id="evidence-heading">
          Evidence inspector <span>{evidence.length}</span>
        </h2>
        <p>Select a reference in the report to inspect its source.</p>
      </div>
      {evidence.length === 0 ? (
        <p className="subtle">No evidence was extracted. Add a more specific failure excerpt.</p>
      ) : (
        <>
          <div className="evidence-list" role="group" aria-label="Evidence sources">
            {evidence.map((item) => (
              <button
                key={item.id}
                type="button"
                className="evidence-source"
                aria-pressed={selected?.id === item.id}
                onClick={() => onSelect(item.id)}
              >
                <span className="evidence-id">{item.id}</span>
                <span>
                  {item.label}
                  <small>
                    {item.kind === "input"
                      ? "Submitted input"
                      : item.kind === "sql_parser"
                        ? "SQL parser"
                        : "Retrieved runbook"}
                  </small>
                </span>
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
          {selected ? (
            <div
              className="evidence-content"
              tabIndex={-1}
              ref={contentRef}
              aria-label={`Evidence ${selected.id}: ${selected.label}`}
            >
              <div className="evidence-content-top">
                <span className="evidence-id">{selected.id}</span>
                <span>
                  {selected.provenance.lineStart
                    ? `Lines ${selected.provenance.lineStart}${selected.provenance.lineEnd && selected.provenance.lineEnd !== selected.provenance.lineStart ? `–${selected.provenance.lineEnd}` : ""}`
                    : selected.kind === "runbook"
                      ? "Reference material"
                      : "Source excerpt"}
                </span>
              </div>
              <pre>
                <code>{selected.content}</code>
              </pre>
              <div className="source-provenance">
                <span>Source</span>
                <code>{selected.provenance.sourceId}</code>
                {sourceUrl ? (
                  <a href={sourceUrl} target="_blank" rel="noreferrer">
                    Open source <span aria-hidden="true">↗</span>
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
      <p className="evidence-caveat">
        A valid reference identifies a source. It does not, by itself, prove a proposed cause.
      </p>
    </aside>
  );
}
