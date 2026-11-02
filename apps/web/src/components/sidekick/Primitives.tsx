"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
export type IconName =
  | "plus"
  | "message"
  | "book"
  | "evidence"
  | "history"
  | "help"
  | "menu"
  | "close"
  | "arrow"
  | "attach"
  | "copy"
  | "check"
  | "stop"
  | "refresh"
  | "trash"
  | "search"
  | "code"
  | "download";
const paths: Record<IconName, string> = {
  plus: "M10 4v12M4 10h12",
  message: "M4 4h12v9H9l-5 3V4Z",
  book: "M10 5C7 3 4 4 2 5v11c3-2 5-2 8 0m0-11c3-2 6-1 8 0v11c-3-2-5-2-8 0V5Z",
  evidence: "M8 3H4v14h12V7l-4-4H8Zm4 0v4h4M7 10h6M7 13h4",
  history: "M3 5v5h5M3 10a7 7 0 1 1 2 5m5-10v5l3 2",
  help: "M8 7a2 2 0 1 1 3 2c-1 0-1 1-1 2m0 3v.1M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z",
  menu: "M3 5h14M3 10h14M3 15h14",
  close: "m5 5 10 10M15 5 5 15",
  arrow: "M10 16V4m-5 5 5-5 5 5",
  attach: "m7 10 5-5a3 3 0 0 1 4 4l-7 7a4 4 0 0 1-6-6l7-7m-3 8 5-5",
  copy: "M7 7h10v10H7V7ZM3 12V3h9",
  check: "m4 10 4 4 8-9",
  stop: "M5 5h10v10H5V5Z",
  refresh: "M16 7a7 7 0 1 0 0 6m0-11v5h-5",
  trash: "M3 5h14M7 5V3h6v2M5 5l1 12h8l1-12M8 8v6m4-6v6",
  search: "M9 3a6 6 0 1 0 0 12A6 6 0 0 0 9 3Zm4 10 4 4",
  code: "m7 5-5 5 5 5m6-10 5 5-5 5M11 3 9 17",
  download: "M10 3v10m-4-4 4 4 4-4M4 14v3h12v-3",
};
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function AgentMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <path
        d="m10 10-5 6 5 6m12-12 5 6-5 6m-4-14-4 16"
        stroke="var(--mark-ink, #fff)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function CopyControl({ text, label = "Copy answer" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="ls-icon-button ls-copy"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      onClick={() => void copy(text, setCopied)}
    >
      <Icon name={copied ? "check" : "copy"} />
    </button>
  );
}
import { copyText } from "../../lib/clipboard";
async function copy(text: string, setCopied: (value: boolean) => void) {
  if (await copyText(text)) {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
}
export function SidePanel({
  title,
  eyebrow,
  children,
  onClose,
  side = "right",
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
  onClose: () => void;
  side?: "left" | "right";
}) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        closeRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);
  return (
    <div className="ls-drawer-layer">
      <button
        type="button"
        className="ls-drawer-scrim"
        tabIndex={-1}
        aria-label="Close panel"
        onClick={onClose}
      />
      <aside
        ref={ref}
        className="ls-panel"
        data-side={side}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeRef.current();
          }
          if (event.key === "Tab") {
            const controls = Array.from(
              ref.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]',
              ) ?? [],
            ).filter((element) => element.getClientRects().length > 0);
            const first = controls[0];
            const last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header className="ls-panel-head">
          <div>
            <span className="ls-overline">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <button
            type="button"
            className="ls-icon-button"
            aria-label={`Close ${title.toLowerCase()}`}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="ls-panel-body">{children}</div>
      </aside>
    </div>
  );
}
