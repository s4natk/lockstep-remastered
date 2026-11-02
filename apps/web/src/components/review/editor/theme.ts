import { EditorView } from "@codemirror/view";

// Colors come from CSS variables, so one theme follows both app color schemes.
// Selectors are plain CodeMirror theme selectors: `&light` and `&dark` are only
// accepted by `EditorView.baseTheme`, and `EditorView.theme` throws on them.
let theme: ReturnType<typeof EditorView.theme> | undefined;

export function lockstepEditorTheme() {
  theme ??= EditorView.theme({
    "&": {
      height: "100%",
      fontSize: "var(--editor-font-size)",
      backgroundColor: "var(--surface-1)",
      color: "var(--syn-name)",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: "var(--font-mono)",
      lineHeight: "1.7",
      overscrollBehavior: "contain",
    },
    ".cm-content": {
      padding: "14px 0 48px",
      caretColor: "var(--accent)",
    },
    ".cm-line": { padding: "0 24px 0 14px" },
    ".cm-gutters": {
      backgroundColor: "var(--surface-1)",
      color: "var(--text-4)",
      borderRight: "none",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      minWidth: "40px",
      padding: "0 4px 0 14px",
      fontVariantNumeric: "tabular-nums",
    },
    ".cm-activeLine": { backgroundColor: "var(--editor-active-line)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--text-2)" },
    ".cm-cursor, .cm-dropCursor": { borderLeft: "2px solid var(--accent)" },
    "&.cm-focused .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "var(--selection) !important",
    },
    "&.cm-focused .cm-matchingBracket": {
      backgroundColor: "var(--accent-soft)",
      color: "inherit",
      outline: "1px solid var(--accent-line)",
      borderRadius: "2px",
    },
    "&.cm-focused .cm-nonmatchingBracket": { color: "var(--danger)", backgroundColor: "transparent" },
    ".cm-placeholder": { color: "var(--text-3)", fontStyle: "normal" },
    ".cm-tooltip": {
      backgroundColor: "var(--overlay)",
      color: "var(--text-1)",
      border: "1px solid var(--line)",
      borderRadius: "var(--radius-md)",
      boxShadow: "var(--shadow-pop)",
    },
    ".cm-tooltip-arrow": { display: "none" },
    ".cm-hazard-tip": {
      display: "grid",
      gap: "6px",
      maxWidth: "360px",
      padding: "9px 11px",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      lineHeight: "1.45",
    },
    ".cm-hazard-tip-row": { display: "grid", gap: "2px" },
    ".cm-hazard-tip-label": { color: "var(--hz)", fontWeight: "600" },
    ".cm-hazard-tip-reason": { color: "var(--text-1)" },
    ".cm-hazard-tip-source": {
      color: "var(--text-3)",
      fontSize: "var(--text-xs)",
      borderTop: "1px solid var(--line-subtle)",
      paddingTop: "6px",
    },
  });
  return theme;
}
