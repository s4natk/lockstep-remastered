"use client";

import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder,
} from "@codemirror/view";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

import { sqlHighlighter } from "../../../lib/sqlHighlight";
import { hazardExtension, setActiveHazard, setHazards, type EditorHazard } from "./hazardField";
import { lockstepEditorTheme } from "./theme";
import styles from "./SqlEditor.module.css";

export interface CursorInfo {
  line: number;
  column: number;
  selected: number;
  lines: number;
  length: number;
}

export interface SqlEditorHandle {
  getValue: () => string;
  /** Replaces the document as one undoable change. */
  setValue: (value: string) => void;
  focus: () => void;
  setHazards: (hazards: EditorHazard[]) => void;
  revealHazard: (hazard: EditorHazard) => void;
  revealRange: (from: number, to: number) => void;
}

interface SqlEditorProps {
  ref?: Ref<SqlEditorHandle>;
  initialValue: string;
  wrap: boolean;
  dark: boolean;
  runShortcut: string;
  onChange: (value: string) => void;
  onCursor: (cursor: CursorInfo) => void;
  onRun: () => void;
  onFormat: () => void;
  onPalette: () => void;
}

function cursorOf(state: EditorState): CursorInfo {
  const range = state.selection.main;
  const line = state.doc.lineAt(range.head);
  return {
    line: line.number,
    column: range.head - line.from + 1,
    selected: Math.abs(range.to - range.from),
    lines: state.doc.lines,
    length: state.doc.length,
  };
}

function placeholderElement(runShortcut: string): HTMLElement {
  const element = document.createElement("div");
  element.textContent = `-- Write or paste a PostgreSQL migration.\n-- ${runShortcut} runs the review.`;
  element.style.whiteSpace = "pre";
  return element;
}

export function SqlEditor({
  ref,
  initialValue,
  wrap,
  dark,
  runShortcut,
  onChange,
  onCursor,
  onRun,
  onFormat,
  onPalette,
}: SqlEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onCursor, onRun, onFormat, onPalette });
  callbacks.current = { onChange, onCursor, onRun, onFormat, onPalette };
  const wrapping = useRef(new Compartment());
  const scheme = useRef(new Compartment());
  const settings = useRef({ initialValue, wrap, dark, runShortcut });

  useEffect(() => {
    if (host.current === null) {
      return;
    }
    const initial = settings.current;
    const state = EditorState.create({
      doc: initial.initialValue,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        indentUnit.of("  "),
        EditorState.tabSize.of(2),
        bracketMatching(),
        closeBrackets(),
        highlightActiveLine(),
        sql({ dialect: PostgreSQL, upperCaseKeywords: true }),
        syntaxHighlighting(sqlHighlighter),
        placeholder(placeholderElement(initial.runShortcut)),
        hazardExtension,
        lockstepEditorTheme(),
        wrapping.current.of(initial.wrap ? EditorView.lineWrapping : []),
        scheme.current.of(EditorView.darkTheme.of(initial.dark)),
        EditorView.contentAttributes.of({ "aria-label": "Migration SQL", spellcheck: "false" }),
        Prec.highest(
          keymap.of([
            {
              key: "Mod-Enter",
              run: () => {
                callbacks.current.onRun();
                return true;
              },
            },
            {
              key: "Shift-Alt-f",
              run: () => {
                callbacks.current.onFormat();
                return true;
              },
            },
            {
              key: "Mod-k",
              run: () => {
                callbacks.current.onPalette();
                return true;
              },
            },
          ]),
        ),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            callbacks.current.onChange(update.state.doc.toString());
          }
          if (update.docChanged || update.selectionSet) {
            callbacks.current.onCursor(cursorOf(update.state));
          }
        }),
      ],
    });
    const editor = new EditorView({ state, parent: host.current });
    view.current = editor;
    callbacks.current.onCursor(cursorOf(state));
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    view.current?.dispatch({ effects: wrapping.current.reconfigure(wrap ? EditorView.lineWrapping : []) });
  }, [wrap]);

  useEffect(() => {
    view.current?.dispatch({ effects: scheme.current.reconfigure(EditorView.darkTheme.of(dark)) });
  }, [dark]);

  useImperativeHandle(
    ref,
    () => ({
      getValue: () => view.current?.state.doc.toString() ?? settings.current.initialValue,
      setValue: (value) => {
        const editor = view.current;
        if (!editor) {
          settings.current.initialValue = value;
          return;
        }
        editor.dispatch({
          changes: { from: 0, to: editor.state.doc.length, insert: value },
          selection: { anchor: Math.min(value.length, editor.state.selection.main.head) },
          effects: setHazards.of([]),
          scrollIntoView: true,
        });
      },
      focus: () => view.current?.focus(),
      setHazards: (hazards) => view.current?.dispatch({ effects: setHazards.of(hazards) }),
      revealHazard: (hazard) => {
        view.current?.dispatch({
          effects: [setActiveHazard.of(hazard.key), EditorView.scrollIntoView(hazard.from, { y: "center" })],
        });
      },
      revealRange: (from, to) => {
        const editor = view.current;
        if (!editor) {
          return;
        }
        const end = Math.min(to, editor.state.doc.length);
        editor.dispatch({
          selection: { anchor: Math.min(from, end), head: end },
          effects: EditorView.scrollIntoView(from, { y: "center" }),
        });
        editor.focus();
      },
    }),
    [],
  );

  return <div ref={host} className={styles.host} />;
}
