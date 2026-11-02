"use client";

import { useState } from "react";

import type { KnowledgeEntry } from "../../lib/knowledge";
import { Button, IconButton } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Switch } from "../ui/Switch";
import styles from "./ContextModal.module.css";

interface ContextModalProps {
  open: boolean;
  entries: KnowledgeEntry[];
  onClose: () => void;
  onChange: (entries: KnowledgeEntry[]) => void;
}

export function ContextModal({ open, entries, onClose, onChange }: ContextModalProps) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");

  const add = () => {
    const trimmed = text.trim();
    if (trimmed === "") {
      return;
    }
    onChange([
      ...entries,
      {
        id: crypto.randomUUID(),
        title: title.trim(),
        text: trimmed,
        enabled: true,
        updatedAt: Date.now(),
      },
    ]);
    setTitle("");
    setText("");
  };

  const update = (id: string, patch: Partial<KnowledgeEntry>) => {
    onChange(entries.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: Date.now() } : entry)));
  };

  return (
    <Dialog open={open} title="Review context" size="lg" onClose={onClose}>
      <div className={styles.root}>
        <p className={styles.lede}>
          Enabled notes are sent with every review and Ask turn as <code>context-N</code> sources. The citation check
          can quote them.
        </p>
        <div className={styles.compose}>
          <input
            value={title}
            placeholder="Title (optional)"
            aria-label="Context title"
            onChange={(event) => setTitle(event.target.value)}
          />
          <textarea
            value={text}
            rows={4}
            placeholder="Deploy window, lock budget, table size…"
            aria-label="Context note"
            onChange={(event) => setText(event.target.value)}
          />
          <Button size="sm" variant="secondary" icon="plus" onClick={add} disabled={text.trim() === ""}>
            Add note
          </Button>
        </div>
        {entries.length === 0 ? (
          <p className={styles.empty}>No context notes yet.</p>
        ) : (
          <ul className={styles.list}>
            {entries.map((entry, index) => (
              <li key={entry.id} className={styles.item} data-enabled={entry.enabled}>
                <div className={styles.itemTop}>
                  <strong>{entry.title || `context-${index}`}</strong>
                  <span className={styles.id}>context-{index}</span>
                  <Switch
                    checked={entry.enabled}
                    label={entry.enabled ? "Disable note" : "Enable note"}
                    onChange={(checked) => update(entry.id, { enabled: checked })}
                  />
                  <IconButton
                    icon="trash"
                    label="Remove note"
                    size="sm"
                    tone="danger"
                    onClick={() => onChange(entries.filter((item) => item.id !== entry.id))}
                  />
                </div>
                <textarea
                  value={entry.text}
                  rows={3}
                  aria-label={entry.title || `Context ${index}`}
                  onChange={(event) => update(entry.id, { text: event.target.value })}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
