"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAssistant } from "../hooks/useAssistant";
import { useHealth } from "../hooks/useHealth";
import { COMPACT_QUERY, MEDIUM_QUERY, MOBILE_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
import { usePersistedText } from "../hooks/usePersistedText";
import { useReviewRun } from "../hooks/useReviewRun";
import { downloadFile } from "../lib/clipboard";
import { byteOffsetMapper } from "../lib/offsets";
import { EXAMPLES } from "../lib/examples";
import { reviewFileName, reviewToJson, reviewToMarkdown } from "../lib/exportReview";
import { formatSql } from "../lib/format";
import { loadHistory, saveHistory, upsertHistory } from "../lib/history";
import { enabledContext, loadKnowledge, saveKnowledge, type KnowledgeEntry } from "../lib/knowledge";
import { isTypingTarget } from "../lib/platform";
import { clampInspector, DEFAULT_PREFERENCES, INSPECTOR_MAX, INSPECTOR_MIN } from "../lib/preferences";
import { extraStatementCount, isActive, reviewTitle, type ReviewRecord } from "../lib/review";
import { STORAGE_KEYS } from "../lib/storage";
import { AskView } from "./ask/AskView";
import { CommandPalette, type Command } from "./overlays/CommandPalette";
import { ContextModal } from "./overlays/ContextModal";
import { ExamplesDrawer } from "./overlays/ExamplesDrawer";
import { SettingsModal } from "./overlays/SettingsModal";
import { usePreferences } from "./providers/PreferencesProvider";
import { useToast } from "./providers/ToastProvider";
import { editorHazards } from "./review/editorHazards";
import type { CursorInfo, SqlEditorHandle } from "./review/editor/SqlEditor";
import type { InspectorTab } from "./review/inspector/ReviewInspector";
import { ReviewInspector } from "./review/inspector/ReviewInspector";
import { ReviewWorkspace } from "./review/ReviewWorkspace";
import { NavSidebar, type WorkspaceView } from "./shell/NavSidebar";
import { IconButton } from "./ui/Button";
import { Kbd, shortcutText, useIsMac } from "./ui/Kbd";
import { Splitter } from "./ui/Splitter";
import { Logo } from "./brand/Logo";
import styles from "./AppShell.module.css";

type Overlay = "examples" | "context" | "settings" | "palette" | null;

export function AppShell() {
  const { preferences, resolvedTheme, update } = usePreferences();
  const toast = useToast();
  const health = useHealth();
  const mac = useIsMac();
  const medium = useMediaQuery(MEDIUM_QUERY);
  const compact = useMediaQuery(COMPACT_QUERY);
  const mobile = useMediaQuery(MOBILE_QUERY);

  const [view, setView] = useState<WorkspaceView>("review");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [tab, setTab] = useState<InspectorTab>("overview");
  const [activeHazard, setActiveHazard] = useState<string | null>(null);
  const [highlightSource, setHighlightSource] = useState<number | null>(null);
  const [history, setHistory] = useState<ReviewRecord[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [cursor, setCursor] = useState<CursorInfo | null>(null);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const [draft, setDraft, draftReady] = usePersistedText(STORAGE_KEYS.draft);
  const [askDraft, setAskDraft] = usePersistedText(STORAGE_KEYS.askDraft);
  const editorRef = useRef<SqlEditorHandle | null>(null);

  const remember = useCallback((record: ReviewRecord) => {
    setHistory((current) => {
      const next = upsertHistory(current, record);
      saveHistory(next);
      return next;
    });
  }, []);

  const run = useReviewRun({ onComplete: remember });
  const assistant = useAssistant({ onReviewComplete: remember });

  useEffect(() => {
    setHistory(loadHistory());
    setKnowledge(loadKnowledge());
  }, []);

  useEffect(() => {
    if (run.record?.progress.connected) {
      health.markReachable();
    }
  }, [health.markReachable, run.record?.progress.connected]);

  useEffect(() => {
    const record = run.record;
    const editor = editorRef.current;
    if (!record?.parse || !editor || editor.getValue() !== record.sql) {
      editor?.setHazards([]);
      return;
    }
    editor.setHazards(editorHazards(record));
  }, [run.record]);

  const navCollapsed = preferences.navCollapsed ?? medium;
  const inspectorOpen = view === "review" && preferences.inspectorOpen;
  const inspectorWidth = liveWidth ?? preferences.inspectorWidth;
  const context = enabledContext(knowledge);
  const busy = isActive(run.record);

  const closeOverlay = useCallback(() => setOverlay(null), []);

  const persistKnowledge = (entries: KnowledgeEntry[]) => {
    setKnowledge(entries);
    saveKnowledge(entries);
  };

  const toggleNav = useCallback(() => {
    if (mobile) {
      setNavOpen((open) => !open);
      return;
    }
    update({ navCollapsed: !navCollapsed });
  }, [mobile, navCollapsed, update]);

  const startReview = useCallback(
    (sql?: string) => {
      const value = (sql ?? editorRef.current?.getValue() ?? draft).trimEnd();
      if (value.trim() === "") {
        toast({ message: "Write a migration first" });
        return;
      }
      if (sql !== undefined) {
        editorRef.current?.setValue(sql);
        setDraft(sql);
      }
      setView("review");
      setTab("overview");
      setActiveHazard(null);
      setHighlightSource(null);
      update({ inspectorOpen: true });
      setNavOpen(false);
      run.start(value, context, health.health?.openai?.mode);
    },
    [context, draft, health.health?.openai?.mode, run, setDraft, toast, update],
  );

  const openReview = useCallback(
    (record: ReviewRecord) => {
      run.show(record);
      editorRef.current?.setValue(record.sql);
      setDraft(record.sql);
      setView("review");
      setTab("overview");
      setActiveHazard(null);
      setHighlightSource(null);
      update({ inspectorOpen: true });
      setNavOpen(false);
    },
    [run, setDraft, update],
  );

  const clearEditor = () => {
    editorRef.current?.setValue("");
    setDraft("");
    run.show(null);
    setActiveHazard(null);
    setHighlightSource(null);
  };

  const format = async () => {
    const sql = editorRef.current?.getValue() ?? draft;
    if (sql.trim() === "") {
      return;
    }
    try {
      const next = await formatSql(sql);
      editorRef.current?.setValue(next);
      setDraft(next);
    } catch {
      toast({ message: "Could not format this SQL", tone: "danger" });
    }
  };

  const exportReview = (kind: "md" | "json") => {
    const record = run.record;
    if (record?.status !== "completed") {
      toast({ message: "Finish a review before exporting" });
      return;
    }
    downloadFile(
      reviewFileName(record, kind),
      kind === "md" ? reviewToMarkdown(record) : reviewToJson(record),
      kind === "md" ? "text/markdown" : "application/json",
    );
  };

  const revealHazard = (key: string) => {
    const record = run.record;
    if (!record) {
      return;
    }
    const hit = editorHazards(record).find((item) => item.key === key);
    if (!hit) {
      return;
    }
    setActiveHazard(key);
    editorRef.current?.revealHazard(hit);
    update({ inspectorOpen: true });
  };

  const jumpStatement = (index: number) => {
    const record = run.record;
    const statement = record?.parse?.statements[index];
    if (!record || !statement) {
      return;
    }
    const toChar = byteOffsetMapper(record.sql);
    editorRef.current?.revealRange(toChar(statement.start), toChar(statement.end));
  };

  const commands = useMemo<Command[]>(() => {
    const actions: Command[] = [
      { id: "review", group: "Actions", label: "Review migration", icon: "play", shortcut: ["Mod", "Enter"], run: () => startReview() },
      { id: "stop", group: "Actions", label: "Stop review", icon: "stop", run: run.stop },
      { id: "format", group: "Actions", label: "Format SQL", icon: "format", shortcut: ["Shift", "Alt", "F"], run: () => void format() },
      { id: "wrap", group: "Actions", label: preferences.wrap ? "Disable wrapping" : "Wrap long lines", icon: "wrap", run: () => update({ wrap: !preferences.wrap }) },
      { id: "inspector", group: "Actions", label: preferences.inspectorOpen ? "Hide inspector" : "Show inspector", icon: "inspector", shortcut: ["Mod", "."], run: () => update({ inspectorOpen: !preferences.inspectorOpen }) },
      { id: "sidebar", group: "Actions", label: "Toggle sidebar", icon: "sidebar", shortcut: ["Mod", "B"], run: toggleNav },
      { id: "new", group: "Actions", label: "Clear editor", icon: "clear", run: clearEditor },
      { id: "examples", group: "Actions", label: "Browse examples", icon: "library", run: () => setOverlay("examples") },
      { id: "context", group: "Actions", label: "Edit context", icon: "context", run: () => setOverlay("context") },
      { id: "settings", group: "Actions", label: "Preferences", icon: "settings", shortcut: ["?"], run: () => setOverlay("settings") },
      { id: "goto-review", group: "Actions", label: "Go to Review", icon: "review", run: () => setView("review") },
      { id: "goto-ask", group: "Actions", label: "Go to Ask", icon: "ask", run: () => setView("ask") },
      { id: "export-md", group: "Actions", label: "Export Markdown", icon: "download", run: () => exportReview("md") },
      { id: "export-json", group: "Actions", label: "Export JSON", icon: "download", run: () => exportReview("json") },
      {
        id: "theme",
        group: "Actions",
        label: resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        icon: resolvedTheme === "dark" ? "sun" : "moon",
        run: () => update({ theme: resolvedTheme === "dark" ? "light" : "dark" }),
      },
    ];
    const examples = EXAMPLES.map((example) => ({
      id: `ex-${example.id}`,
      group: "Examples",
      label: example.title,
      hint: example.category,
      icon: "library" as const,
      keywords: `${example.summary} ${example.sql}`,
      run: () => startReview(example.sql),
    }));
    const recents = history.map((record) => ({
      id: `rev-${record.id}`,
      group: "Recent reviews",
      label: reviewTitle(record),
      hint: extraStatementCount(record) > 0 ? `+${extraStatementCount(record)}` : undefined,
      icon: "history" as const,
      run: () => openReview(record),
    }));
    return [...actions, ...examples, ...recents];
  }, [history, openReview, preferences.inspectorOpen, preferences.wrap, resolvedTheme, startReview, toggleNav, update]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOverlay((current) => (current === "palette" ? null : "palette"));
        return;
      }
      if (mod && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleNav();
        return;
      }
      if (mod && event.key === ".") {
        event.preventDefault();
        update({ inspectorOpen: !preferences.inspectorOpen });
        return;
      }
      if (event.key === "?" && !mod && !isTypingTarget(event.target)) {
        event.preventDefault();
        setOverlay("settings");
        return;
      }
      if (event.key === "Escape") {
        if (overlay) {
          setOverlay(null);
        } else if (navOpen) {
          setNavOpen(false);
        } else if (compact && preferences.inspectorOpen) {
          update({ inspectorOpen: false });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compact, navOpen, overlay, preferences.inspectorOpen, toggleNav, update]);

  const inspector = (
    <ReviewInspector
      record={run.record}
      tab={tab}
      onTab={setTab}
      activeHazard={activeHazard}
      highlightSource={highlightSource}
      onSelectHazard={revealHazard}
      onJumpStatement={jumpStatement}
      onOpenSource={(index) => {
        setHighlightSource(index);
        setTab("sources");
        update({ inspectorOpen: true });
      }}
      onExamples={() => setOverlay("examples")}
    />
  );

  return (
    <div className={styles.shell}>
      {mobile && navOpen ? <button type="button" className={styles.scrim} aria-label="Close sidebar" onClick={() => setNavOpen(false)} /> : null}
      <NavSidebar
        view={view}
        collapsed={navCollapsed}
        overlay={mobile && navOpen}
        history={history}
        activeId={run.record?.id}
        contextCount={context.length}
        connection={health.state}
        model={health.health?.openai?.chatModel}
        onView={(next) => {
          setView(next);
          setNavOpen(false);
        }}
        onOpenReview={openReview}
        onExamples={() => setOverlay("examples")}
        onContext={() => setOverlay("context")}
        onSettings={() => setOverlay("settings")}
        onPalette={() => setOverlay("palette")}
        onToggleCollapsed={toggleNav}
        onCloseOverlay={() => setNavOpen(false)}
      />

      <div className={styles.main}>
        {compact ? (
          <header className={styles.top}>
            <IconButton icon="menu" label="Open sidebar" onClick={() => setNavOpen(true)} />
            <Logo size={16} />
            <span className={styles.grow} />
            <IconButton icon="search" label="Command palette" onClick={() => setOverlay("palette")} />
            {view === "review" ? (
              <IconButton
                icon="inspector"
                label={inspectorOpen ? "Hide inspector" : "Show inspector"}
                active={inspectorOpen}
                onClick={() => update({ inspectorOpen: !preferences.inspectorOpen })}
              />
            ) : null}
          </header>
        ) : null}

        <div className={styles.workspace}>
          <div className={styles.editor}>
            {view === "review" && draftReady ? (
              <ReviewWorkspace
                editorRef={editorRef}
                initialValue={draft}
                wrap={preferences.wrap}
                dark={resolvedTheme === "dark"}
                runShortcut={shortcutText(["Mod", "Enter"], mac)}
                record={run.record}
                busy={busy}
                cursor={cursor}
                onChange={setDraft}
                onCursor={setCursor}
                onRun={() => startReview()}
                onStop={run.stop}
                onFormat={() => void format()}
                onPalette={() => setOverlay("palette")}
                onExamples={() => setOverlay("examples")}
                onClear={clearEditor}
                onToggleWrap={() => update({ wrap: !preferences.wrap })}
                onExportMarkdown={() => exportReview("md")}
                onExportJson={() => exportReview("json")}
                inspectorOpen={preferences.inspectorOpen}
                onToggleInspector={() => update({ inspectorOpen: !preferences.inspectorOpen })}
              />
            ) : view === "ask" ? (
              <AskView
                messages={assistant.messages}
                busy={assistant.busy}
                draft={askDraft}
                contextCount={context.length}
                onDraft={setAskDraft}
                onSend={(text) => assistant.send(text, context)}
                onStop={assistant.stop}
                onRetry={(id) => assistant.retry(id, context)}
                onClear={assistant.clear}
                onOpenReview={openReview}
                onContext={() => setOverlay("context")}
              />
            ) : null}
          </div>

          {inspectorOpen && !compact ? (
            <>
              <Splitter
                label="Inspector width"
                value={inspectorWidth}
                min={INSPECTOR_MIN}
                max={INSPECTOR_MAX}
                defaultValue={DEFAULT_PREFERENCES.inspectorWidth}
                onChange={(value) => setLiveWidth(value)}
                onCommit={(value) => {
                  setLiveWidth(null);
                  update({ inspectorWidth: clampInspector(value) });
                }}
              />
              <div className={styles.inspector} style={{ width: inspectorWidth }}>
                {inspector}
              </div>
            </>
          ) : null}

          {inspectorOpen && compact ? (
            <div className={styles.sheet}>
              <header className={styles.sheetBar}>
                <span>Inspector</span>
                <IconButton icon="x" label="Close inspector" onClick={() => update({ inspectorOpen: false })} />
              </header>
              {inspector}
            </div>
          ) : null}
        </div>
      </div>

      <ExamplesDrawer
        open={overlay === "examples"}
        onClose={closeOverlay}
        onInsert={(sql) => {
          editorRef.current?.setValue(sql);
          setDraft(sql);
          setView("review");
        }}
        onRun={(sql) => startReview(sql)}
      />
      <ContextModal open={overlay === "context"} entries={knowledge} onClose={closeOverlay} onChange={persistKnowledge} />
      <SettingsModal
        open={overlay === "settings"}
        preferences={preferences}
        connection={health.state}
        model={health.health?.openai?.chatModel}
        historyCount={history.length}
        onClose={closeOverlay}
        onUpdate={update}
        onClearHistory={() => {
          setHistory([]);
          saveHistory([]);
          toast({ message: "Cleared review history" });
        }}
      />
      <CommandPalette open={overlay === "palette"} commands={commands} onClose={closeOverlay} />

      <span className="sr-only">
        Press <Kbd keys={["Mod", "K"]} /> for the command palette.
      </span>
    </div>
  );
}
