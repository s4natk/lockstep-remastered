"use client";

import { useState } from "react";

import type { KnowledgeEntry } from "../lib/knowledge";
import { CloseIcon } from "./icons";

interface ContextSidebarProps {
  open: boolean;
  inert: boolean;
  entries: KnowledgeEntry[];
  onAdd: (text: string) => void;
  onRemove: (id: string) => void;
  onNewConversation: () => void;
  onClose: () => void;
  aiMode?: "live" | "mock";
}

export function ContextSidebar({
  open,
  inert,
  entries,
  onAdd,
  onRemove,
  onNewConversation,
  onClose,
  aiMode,
}: ContextSidebarProps) {
  const [draft, setDraft] = useState("");
  const trimmed = draft.trim();

  function add() {
    if (trimmed === "") {
      return;
    }
    onAdd(trimmed);
    setDraft("");
  }

  return (
    <aside className={open ? "sidebar open" : "sidebar"} inert={inert ? true : undefined}>
      <div className="brand">
        <span className="brand-dot" aria-hidden="true" />
        <div className="brand-copy">
          <strong>Lockstep</strong>
          <p>Postgres migration copilot</p>
        </div>
        <button type="button" className="icon-btn close-btn" aria-label="Close context" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div className="sidebar-body">
        <h2 className="kicker">Extra context</h2>
        <p className="context-copy">
          Team runbooks or rollout notes feed into SQL reviews.{aiMode === "mock" ? " Chat uses demo replies until OPENAI_API_KEY is set on the worker." : null}
        </p>
        <textarea
          className="context-input"
          value={draft}
          placeholder="Paste documentation here..."
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="button" className="add-btn" onClick={add} disabled={trimmed === ""}>
          Save context
        </button>
        {entries.length > 0 ? (
          <ul className="entries">
            {entries.map((entry) => (
              <li key={entry.id} className="entry">
                <p title={entry.text}>{entry.text}</p>
                <button type="button" aria-label="Remove context" onClick={() => onRemove(entry.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <button type="button" className="new-chat" onClick={onNewConversation}>
        New conversation
      </button>
    </aside>
  );
}
