"use client";

import { useRef } from "react";

import { Icon, type IconName } from "./Icon";
import styles from "./Segmented.module.css";

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  badge?: string;
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
  stretch?: boolean;
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = "md",
  stretch,
}: SegmentedProps<T>) {
  const group = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = options.findIndex((option) => option.value === value);
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (index + 1) % options.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (index - 1 + options.length) % options.length;
    } else {
      return;
    }
    event.preventDefault();
    onChange(options[next]!.value);
    group.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  };

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      className={styles.group}
      data-size={size}
      data-stretch={stretch || undefined}
      onKeyDown={onKeyDown}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={styles.option}
            onClick={() => onChange(option.value)}
          >
            {option.icon ? <Icon name={option.icon} size={14} /> : null}
            <span>{option.label}</span>
            {option.badge ? <span className={styles.badge}>{option.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
