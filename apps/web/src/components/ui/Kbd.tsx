"use client";

import { useSyncExternalStore } from "react";

import { isMacPlatform, keyLabel } from "../../lib/platform";
import styles from "./Kbd.module.css";

const subscribe = () => () => undefined;

export function useIsMac(): boolean {
  return useSyncExternalStore(subscribe, isMacPlatform, () => false);
}

export function Kbd({ keys, className }: { keys: string[]; className?: string }) {
  const mac = useIsMac();
  return (
    <span className={[styles.combo, className].filter(Boolean).join(" ")}>
      {keys.map((key) => (
        <kbd key={key} className={styles.key}>
          {keyLabel(key, mac)}
        </kbd>
      ))}
    </span>
  );
}

export function shortcutText(keys: string[], mac: boolean): string {
  return keys.map((key) => keyLabel(key, mac)).join(mac ? "" : "+");
}
