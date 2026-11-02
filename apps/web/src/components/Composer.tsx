"use client";

import { useLayoutEffect, useRef, type KeyboardEvent } from "react";

import { ArrowIcon } from "./icons";

interface ComposerProps {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
}

export function Composer({ value, busy, onChange, onSend }: ComposerProps) {
  const field = useRef<HTMLTextAreaElement>(null);
  const canSend = !busy && value.trim() !== "";

  useLayoutEffect(() => {
    const element = field.current;
    if (element === null) {
      return;
    }
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [value]);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  }

  return (
    <div className="composer-dock">
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <label className="sr-only" htmlFor="chat-input">
          Message Lockstep
        </label>
        <textarea
          id="chat-input"
          ref={field}
          rows={1}
          value={value}
          placeholder="Say hi, ask about migrations, or paste SQL…"
          spellCheck={true}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="send" aria-label="Send message" disabled={!canSend}>
          <ArrowIcon />
        </button>
      </form>
      <p className="composer-hint">
        <span>enter</span> to send · <span>shift+enter</span> for new line
      </p>
    </div>
  );
}
