"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  deleteInvestigation,
  fetchInvestigationHistory,
  investigationErrorMessage,
  type InvestigationSummary,
} from "../../lib/investigationClient";
import { FAILURE_LABELS } from "../../lib/investigationExamples";
import { AppFrame, Arrow } from "./AppFrame";

export function HistoryView() {
  const [items, setItems] = useState<InvestigationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchInvestigationHistory(signal);
      if (!signal?.aborted) setItems(result);
    } catch (cause) {
      if (!signal?.aborted) setError(investigationErrorMessage(cause));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const remove = async (id: string) => {
    setDeleting(id);
    setError(null);
    try {
      await deleteInvestigation(id);
      setItems((current) => current.filter((item) => item.id !== id));
      setConfirmDelete(null);
    } catch (cause) {
      setError(investigationErrorMessage(cause));
    } finally {
      setDeleting(null);
    }
  };
  return (
    <AppFrame>
      <div className="page-intro">
        <div>
          <p className="eyebrow">YOUR INVESTIGATIONS</p>
          <h1>Pick up where you left off.</h1>
          <p>Review saved evidence, reasoning, and next steps.</p>
        </div>
        <Link className="action action-primary" href="/investigate">
          New investigation <Arrow />
        </Link>
      </div>
      <div className="history-toolbar">
        <h2>
          Investigation history <span>{loading ? "…" : items.length}</span>
        </h2>
        <button
          type="button"
          className="text-action"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? "Loading…" : "Refresh"} <span aria-hidden="true">↻</span>
        </button>
      </div>
      <p className="privacy-note">
        Private to this browser’s access key. Clearing site storage removes your access to saved
        investigations. Input and reports are stored by the backend.
      </p>
      {error ? (
        <div className="notice notice-error" role="alert">
          <strong>History could not be loaded</strong>
          <span>{error}</span>
          <button className="text-action" type="button" onClick={() => void load()}>
            Try again <Arrow />
          </button>
        </div>
      ) : null}
      {loading ? (
        <div className="history-loading" role="status">
          <span className="loading-spinner" /> Loading saved investigations…
        </div>
      ) : !error && items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
              <path d="M8 5h12l5 5v17H8V5Z" stroke="currentColor" strokeWidth="1.5" />
              <path d="M19 5v6h6M12 16h9M12 21h6" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
          <h2>Your first investigation starts here.</h2>
          <p>
            Completed investigations appear here with their evidence and next steps. Start with your
            own failure or a supported example.
          </p>
          <Link className="action action-primary" href="/investigate">
            Start investigating <Arrow />
          </Link>
        </div>
      ) : (
        <div className="history-list">
          {items.map((item) => (
            <article key={item.id} className="history-item">
              <Link
                href={`/investigate?id=${encodeURIComponent(item.id)}`}
                className="history-item-link"
              >
                <div className="history-item-meta">
                  <span className="category-tag">{FAILURE_LABELS[item.kind]}</span>
                  <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
                </div>
                <h3>{item.summary || "Untitled investigation"}</h3>
                <p>
                  <span className="complete-label">
                    {item.status === "complete" ? "Complete" : item.status}
                  </span>
                  <span>
                    {item.mode === "ai"
                      ? "AI-assisted"
                      : item.mode === "deterministic"
                        ? "Deterministic analysis"
                        : "No completed report"}
                  </span>
                  <span className="history-open">
                    {item.status === "complete" ? "Open report" : "View status"} <Arrow />
                  </span>
                </p>
              </Link>
              <div className="history-item-actions">
                {confirmDelete === item.id ? (
                  <>
                    <span>Delete this investigation?</span>
                    <button
                      type="button"
                      className="delete-action"
                      disabled={deleting === item.id}
                      onClick={() => void remove(item.id)}
                    >
                      {deleting === item.id ? "Deleting…" : "Delete"}
                    </button>
                    <button
                      type="button"
                      className="text-action"
                      disabled={deleting === item.id}
                      onClick={() => setConfirmDelete(null)}
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="text-action delete-action"
                    onClick={() => setConfirmDelete(item.id)}
                  >
                    Delete <span className="sr-only">investigation {item.summary}</span>
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </AppFrame>
  );
}
