"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Icon, type IconName } from "./Icon";
import styles from "./Menu.module.css";

export interface MenuItem {
  id: string;
  label: string;
  icon?: IconName;
  hint?: ReactNode;
  disabled?: boolean;
  tone?: "danger";
  run: () => void;
}

interface MenuProps {
  label: string;
  items: MenuItem[];
  align?: "start" | "end";
  trigger: (props: {
    ref: (element: HTMLButtonElement | null) => void;
    onClick: () => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
    "aria-controls": string;
  }) => ReactNode;
}

export function Menu({ label, items, align = "end", trigger }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const enabled = items.filter((item) => !item.disabled);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!listRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  useEffect(() => {
    if (open) {
      listRef.current?.querySelector<HTMLButtonElement>(`[data-index="${active}"]`)?.focus();
    }
  }, [open, active]);

  const close = (focusTrigger: boolean) => {
    setOpen(false);
    if (focusTrigger) {
      triggerRef.current?.focus();
    }
  };

  const openAt = (index: number) => {
    setActive(index);
    setOpen(true);
  };

  const onListKey = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (current + 1) % enabled.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (current - 1 + enabled.length) % enabled.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(enabled.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      close(false);
    }
  };

  return (
    <div className={styles.root}>
      {trigger({
        ref: (element) => {
          triggerRef.current = element;
        },
        onClick: () => (open ? close(false) : openAt(0)),
        onKeyDown: (event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openAt(0);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            openAt(Math.max(0, enabled.length - 1));
          }
        },
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": id,
      })}
      {open ? (
        <div
          ref={listRef}
          id={id}
          role="menu"
          aria-label={label}
          className={styles.menu}
          data-align={align}
          onKeyDown={onListKey}
        >
          {enabled.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              tabIndex={index === active ? 0 : -1}
              data-index={index}
              data-tone={item.tone}
              className={styles.item}
              onMouseEnter={() => setActive(index)}
              onClick={() => {
                close(true);
                item.run();
              }}
            >
              {item.icon ? <Icon name={item.icon} size={14} className={styles.itemIcon} /> : null}
              <span className={styles.itemLabel}>{item.label}</span>
              {item.hint ? <span className={styles.hint}>{item.hint}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
