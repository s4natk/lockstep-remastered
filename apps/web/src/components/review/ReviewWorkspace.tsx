"use client";

import type { RefObject } from "react";

import { hazardCounts, plural } from "../../lib/hazards";
import { isActive, type ReviewRecord } from "../../lib/review";
import { statusText } from "./inspector/pipeline";
import { Button, IconButton } from "../ui/Button";
import { HazardTag } from "../ui/HazardTag";
import { Icon } from "../ui/Icon";
import { Kbd } from "../ui/Kbd";
import { Menu } from "../ui/Menu";
import { SqlEditor, type CursorInfo, type SqlEditorHandle } from "./editor/SqlEditor";
import styles from "./ReviewWorkspace.module.css";

interface ReviewWorkspaceProps {
  editorRef: RefObject<SqlEditorHandle | null>;
  initialValue: string;
  wrap: boolean;
  dark: boolean;
  runShortcut: string;
  record: ReviewRecord | null;
  busy: boolean;
  cursor: CursorInfo | null;
  onChange: (value: string) => void;
  onCursor: (cursor: CursorInfo) => void;
  onRun: () => void;
  onStop: () => void;
  onFormat: () => void;
  onPalette: () => void;
  onExamples: () => void;
  onClear: () => void;
  onToggleWrap: () => void;
  onExportMarkdown: () => void;
  onExportJson: () => void;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
}

export function ReviewWorkspace({
  editorRef,
  initialValue,
  wrap,
  dark,
  runShortcut,
  record,
  busy,
  cursor,
  onChange,
  onCursor,
  onRun,
  onStop,
  onFormat,
  onPalette,
  onExamples,
  onClear,
  onToggleWrap,
  onExportMarkdown,
  onExportJson,
  inspectorOpen,
  onToggleInspector,
}: ReviewWorkspaceProps) {
  const counts = hazardCounts(record?.parse);
  const realHazards = counts.filter((entry) => entry.code !== "safe");

  return (
    <section className={styles.root} aria-label="Migration editor">
      <header className={styles.toolbar}>
        <div className={styles.left}>
          <span className={styles.kicker}>SQL</span>
          {record ? (
            <span className={styles.status} data-state={record.status}>
              <span className={styles.pulse} aria-hidden="true" />
              {statusText(record)}
            </span>
          ) : (
            <span className={styles.hint}>
              PostgreSQL · <Kbd keys={["Mod", "Enter"]} /> reviews
            </span>
          )}
        </div>
        <div className={styles.actions}>
          <IconButton
            icon="inspector"
            label={inspectorOpen ? "Hide inspector" : "Show inspector"}
            active={inspectorOpen}
            onClick={onToggleInspector}
          />
          <IconButton icon="library" label="Example migrations" onClick={onExamples} />
          <IconButton icon="wrap" label={wrap ? "Disable wrapping" : "Wrap long lines"} active={wrap} onClick={onToggleWrap} />
          <IconButton icon="format" label="Format SQL" onClick={onFormat} />
          <IconButton icon="clear" label="Clear editor" onClick={onClear} disabled={busy} />
          <Menu
            label="Export"
            items={[
              { id: "md", label: "Export Markdown", icon: "download", disabled: record?.status !== "completed", run: onExportMarkdown },
              { id: "json", label: "Export JSON", icon: "download", disabled: record?.status !== "completed", run: onExportJson },
            ]}
            trigger={(props) => (
              <button {...props} type="button" className={styles.menuTrigger} aria-label="Export review">
                <Icon name="download" size={16} />
              </button>
            )}
          />
          {busy ? (
            <Button variant="danger" icon="stop" onClick={onStop}>
              Stop
            </Button>
          ) : (
            <Button variant="primary" icon="play" onClick={onRun}>
              Review
            </Button>
          )}
        </div>
      </header>

      <SqlEditor
        ref={editorRef}
        initialValue={initialValue}
        wrap={wrap}
        dark={dark}
        runShortcut={runShortcut}
        onChange={onChange}
        onCursor={onCursor}
        onRun={onRun}
        onFormat={onFormat}
        onPalette={onPalette}
      />

      <footer className={styles.footer}>
        <span className={styles.cursor}>
          {cursor
            ? `Ln ${cursor.line}, Col ${cursor.column}${cursor.selected > 0 ? ` · ${cursor.selected} sel` : ""}`
            : "Ln 1, Col 1"}
        </span>
        <span className={styles.sep} aria-hidden="true" />
        <span>
          {cursor ? plural(cursor.lines, "line") : "0 lines"}
          {record?.parse ? ` · ${plural(record.parse.statements.length, "statement")}` : ""}
        </span>
        {realHazards.length > 0 ? (
          <>
            <span className={styles.sep} aria-hidden="true" />
            <span className={styles.tags}>
              {realHazards.map((entry) => (
                <HazardTag key={entry.code} code={entry.code} count={entry.count} variant="inline" />
              ))}
            </span>
          </>
        ) : null}
        {isActive(record) ? <span className={styles.live}>Streaming</span> : null}
      </footer>
    </section>
  );
}
