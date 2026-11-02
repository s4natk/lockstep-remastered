"use client";

interface ThinkingBubbleProps {
  label: string;
}

export function ThinkingBubble({ label }: ThinkingBubbleProps) {
  return (
    <div className="thinking" aria-label={label}>
      <span className="thinking-shimmer" aria-hidden="true" />
      <span className="thinking-label">{label}</span>
      <span className="thinking-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}
