"use client";

import { useMemo, useState } from "react";

import { EXAMPLE_CATEGORIES, EXAMPLES, type ExampleCategory, type ExampleMigration } from "../../lib/examples";
import { Button } from "../ui/Button";
import { CodeBlock } from "../ui/CodeBlock";
import { Dialog } from "../ui/Dialog";
import { HazardTag } from "../ui/HazardTag";
import { Icon } from "../ui/Icon";
import styles from "./ExamplesDrawer.module.css";

interface ExamplesDrawerProps {
  open: boolean;
  onClose: () => void;
  onInsert: (sql: string) => void;
  onRun: (sql: string) => void;
}

export function ExamplesDrawer({ open, onClose, onInsert, onRun }: ExamplesDrawerProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ExampleCategory | "all">("all");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return EXAMPLES.filter((example) => {
      if (category !== "all" && example.category !== category) {
        return false;
      }
      if (needle === "") {
        return true;
      }
      return `${example.title} ${example.summary} ${example.sql}`.toLowerCase().includes(needle);
    });
  }, [category, query]);

  return (
    <Dialog open={open} title="Example migrations" size="xl" onClose={onClose}>
      <div className={styles.root}>
        <div className={styles.controls}>
          <label className={styles.search}>
            <Icon name="search" size={14} />
            <input
              type="search"
              value={query}
              placeholder="Search examples"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className={styles.filters} role="tablist" aria-label="Example category">
            <FilterChip label="All" active={category === "all"} onClick={() => setCategory("all")} />
            {EXAMPLE_CATEGORIES.map((entry) => (
              <FilterChip
                key={entry}
                label={entry}
                active={category === entry}
                onClick={() => setCategory(entry)}
              />
            ))}
          </div>
        </div>
        <ul className={styles.list}>
          {visible.map((example) => (
            <ExampleRow
              key={example.id}
              example={example}
              onInsert={() => {
                onInsert(example.sql);
                onClose();
              }}
              onRun={() => {
                onRun(example.sql);
                onClose();
              }}
            />
          ))}
        </ul>
        {visible.length === 0 ? <p className={styles.empty}>No examples match that filter.</p> : null}
      </div>
    </Dialog>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" role="tab" aria-selected={active} className={styles.chip} onClick={onClick}>
      {label}
    </button>
  );
}

function ExampleRow({
  example,
  onInsert,
  onRun,
}: {
  example: ExampleMigration;
  onInsert: () => void;
  onRun: () => void;
}) {
  return (
    <li className={styles.item}>
      <div className={styles.meta}>
        <div>
          <h3>{example.title}</h3>
          <p>{example.summary}</p>
        </div>
        <div className={styles.tags}>
          {example.fixture.labels.map((code, index) => (
            <HazardTag key={`${code}:${index}`} code={code} />
          ))}
        </div>
      </div>
      <CodeBlock code={example.sql} />
      <div className={styles.rowActions}>
        <Button size="sm" variant="ghost" onClick={onInsert}>
          Insert
        </Button>
        <Button size="sm" variant="secondary" icon="play" onClick={onRun}>
          Review
        </Button>
      </div>
    </li>
  );
}
