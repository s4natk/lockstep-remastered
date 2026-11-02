"use client";

import { useEffect, useRef, useState } from "react";

import { copyText } from "../../lib/clipboard";
import { Button, IconButton } from "./Button";

interface CopyButtonProps {
  text: string | (() => string);
  label: string;
  /** Renders a labelled button instead of an icon-only one. */
  children?: string;
  size?: "sm" | "md";
}

export function CopyButton({ text, label, children, size = "sm" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    const ok = await copyText(typeof text === "function" ? text() : text);
    if (!ok) {
      return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1400);
  };

  if (children) {
    return (
      <Button size={size} variant="ghost" icon={copied ? "check" : "copy"} onClick={copy} aria-label={label}>
        {copied ? "Copied" : children}
      </Button>
    );
  }
  return (
    <>
      <IconButton icon={copied ? "check" : "copy"} label={copied ? "Copied" : label} size={size} onClick={copy} />
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </>
  );
}
