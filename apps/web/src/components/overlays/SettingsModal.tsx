"use client";

import type { ReactNode } from "react";

import type { ConnectionState } from "../../lib/connection";
import { connectionDetail } from "../../lib/connection";
import type { EditorFontSize, Preferences, ThemePreference } from "../../lib/preferences";
import { Dialog } from "../ui/Dialog";
import { Kbd } from "../ui/Kbd";
import { Segmented } from "../ui/Segmented";
import { Switch } from "../ui/Switch";
import styles from "./SettingsModal.module.css";

interface SettingsModalProps {
  open: boolean;
  preferences: Preferences;
  connection: ConnectionState;
  model?: string;
  historyCount: number;
  onClose: () => void;
  onUpdate: (patch: Partial<Preferences>) => void;
  onClearHistory: () => void;
}

export function SettingsModal({
  open,
  preferences,
  connection,
  model,
  historyCount,
  onClose,
  onUpdate,
  onClearHistory,
}: SettingsModalProps) {
  return (
    <Dialog open={open} title="Preferences" size="md" onClose={onClose}>
      <div className={styles.root}>
        <section>
          <h3>Appearance</h3>
          <Row label="Theme">
            <Segmented
              label="Theme"
              size="sm"
              value={preferences.theme}
              onChange={(theme: ThemePreference) => onUpdate({ theme })}
              options={[
                { value: "system", label: "System", icon: "monitor" },
                { value: "dark", label: "Dark", icon: "moon" },
                { value: "light", label: "Light", icon: "sun" },
              ]}
            />
          </Row>
        </section>

        <section>
          <h3>Editor</h3>
          <Row label="Font size">
            <Segmented
              label="Font size"
              size="sm"
              value={String(preferences.fontSize)}
              onChange={(value) => onUpdate({ fontSize: Number(value) as EditorFontSize })}
              options={[
                { value: "12", label: "12" },
                { value: "13", label: "13" },
                { value: "14", label: "14" },
                { value: "15", label: "15" },
              ]}
            />
          </Row>
          <Row label="Wrap long lines">
            <Switch checked={preferences.wrap} label="Wrap long lines" onChange={(wrap) => onUpdate({ wrap })} />
          </Row>
        </section>

        <section>
          <h3>Worker</h3>
          <p className={styles.detail}>{connectionDetail(connection, model)}</p>
        </section>

        <section>
          <h3>Shortcuts</h3>
          <ul className={styles.shortcuts}>
            <Shortcut keys={["Mod", "Enter"]} label="Review migration / send" />
            <Shortcut keys={["Mod", "K"]} label="Command palette" />
            <Shortcut keys={["Shift", "Alt", "F"]} label="Format SQL" />
            <Shortcut keys={["Mod", "B"]} label="Toggle sidebar" />
            <Shortcut keys={["Mod", "."]} label="Toggle inspector" />
            <Shortcut keys={["?"]} label="Open preferences" />
            <Shortcut keys={["Escape"]} label="Close overlay" />
          </ul>
        </section>

        <section>
          <h3>This browser</h3>
          <Row label={`${historyCount} saved reviews`}>
            <button type="button" className={styles.danger} onClick={onClearHistory} disabled={historyCount === 0}>
              Clear history
            </button>
          </Row>
        </section>
      </div>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <span>{label}</span>
      {children}
    </div>
  );
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <li>
      <span>{label}</span>
      <Kbd keys={keys} />
    </li>
  );
}
