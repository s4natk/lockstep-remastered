"use client";

import { useRef } from "react";

import styles from "./Splitter.module.css";

interface SplitterProps {
  label: string;
  /** Width of the panel to the right of the splitter. */
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
}

export function Splitter({ label, value, min, max, defaultValue, onChange, onCommit }: SplitterProps) {
  const drag = useRef<{ startX: number; startValue: number; latest: number } | null>(null);

  const clamp = (next: number) => Math.round(Math.min(max, Math.max(min, next)));

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      className={styles.splitter}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { startX: event.clientX, startValue: value, latest: value };
        document.documentElement.dataset.resizing = "true";
      }}
      onPointerMove={(event) => {
        if (!drag.current) {
          return;
        }
        const next = clamp(drag.current.startValue + (drag.current.startX - event.clientX));
        drag.current.latest = next;
        onChange(next);
      }}
      onPointerUp={(event) => {
        if (!drag.current) {
          return;
        }
        event.currentTarget.releasePointerCapture(event.pointerId);
        onCommit(drag.current.latest);
        drag.current = null;
        delete document.documentElement.dataset.resizing;
      }}
      onPointerCancel={() => {
        drag.current = null;
        delete document.documentElement.dataset.resizing;
      }}
      onDoubleClick={() => onCommit(clamp(defaultValue))}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 64 : 16;
        let next: number | null = null;
        if (event.key === "ArrowLeft") {
          next = value + step;
        } else if (event.key === "ArrowRight") {
          next = value - step;
        } else if (event.key === "Home") {
          next = max;
        } else if (event.key === "End") {
          next = min;
        }
        if (next !== null) {
          event.preventDefault();
          onCommit(clamp(next));
        }
      }}
    />
  );
}
