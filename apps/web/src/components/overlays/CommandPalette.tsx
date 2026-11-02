"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon, type IconName } from "../ui/Icon";
import { Kbd } from "../ui/Kbd";
import styles from "./CommandPalette.module.css";

export interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon?: IconName;
  shortcut?: string[];
  keywords?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  commands: Command[];
  onClose: () => void;
}

export function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => rankCommands(commands, query), [commands, query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery("");
    setActive(0);
    input.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const run = (command: Command) => {
    onClose();
    command.run();
  };

  return createPortal(
    <div className={styles.scrim} onMouseDown={onClose}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={input}
          value={query}
          placeholder="Run a command, open a review, or insert an example"
          aria-label="Filter commands"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((current) => Math.min(matches.length - 1, current + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((current) => Math.max(0, current - 1));
            } else if (event.key === "Enter") {
              event.preventDefault();
              const command = matches[active];
              if (command) {
                run(command);
              }
            }
          }}
        />
        <div ref={list} className={styles.list} role="listbox">
          {matches.length === 0 ? <p className={styles.empty}>No matching commands.</p> : null}
          {groupCommands(matches).map((group) => (
            <section key={group.name}>
              <h3>{group.name}</h3>
              {group.items.map((command) => {
                const index = matches.indexOf(command);
                return (
                  <button
                    key={command.id}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    data-index={index}
                    className={styles.item}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => run(command)}
                  >
                    {command.icon ? <Icon name={command.icon} size={14} /> : null}
                    <span className={styles.label}>{command.label}</span>
                    {command.hint ? <span className={styles.hint}>{command.hint}</span> : null}
                    {command.shortcut ? <Kbd keys={command.shortcut} /> : null}
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function rankCommands(commands: Command[], query: string): Command[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return commands;
  }
  return commands
    .map((command) => ({ command, score: score(`${command.label} ${command.hint ?? ""} ${command.keywords ?? ""} ${command.group}`, needle) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.command);
}

function score(haystack: string, needle: string): number {
  const text = haystack.toLowerCase();
  if (text === needle) {
    return 100;
  }
  if (text.startsWith(needle)) {
    return 80;
  }
  if (text.includes(needle)) {
    return 50;
  }
  let at = 0;
  for (const char of needle) {
    at = text.indexOf(char, at);
    if (at === -1) {
      return 0;
    }
    at += 1;
  }
  return 15;
}

function groupCommands(commands: Command[]): Array<{ name: string; items: Command[] }> {
  const groups: Array<{ name: string; items: Command[] }> = [];
  for (const command of commands) {
    const current = groups[groups.length - 1];
    if (current?.name === command.group) {
      current.items.push(command);
    } else {
      groups.push({ name: command.group, items: [command] });
    }
  }
  return groups;
}
