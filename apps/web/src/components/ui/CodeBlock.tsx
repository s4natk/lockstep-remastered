"use client";

import { memo, useMemo, type ReactNode } from "react";

import { highlightSql } from "../../lib/sqlHighlight";
import styles from "./CodeBlock.module.css";

interface CodeBlockProps {
  code: string;
  language?: "sql" | "text";
  lineNumbers?: boolean;
  firstLine?: number;
  maxHeight?: number;
  actions?: ReactNode;
  caption?: ReactNode;
  className?: string;
}

export const CodeBlock = memo(function CodeBlock({
  code,
  language = "sql",
  lineNumbers = false,
  firstLine = 1,
  maxHeight,
  actions,
  caption,
  className,
}: CodeBlockProps) {
  const lines = useMemo(
    () =>
      language === "sql"
        ? highlightSql(code)
        : code.split("\n").map((text) => ({ tokens: [{ text, className: "" }] })),
    [code, language],
  );

  return (
    <figure className={[styles.block, className].filter(Boolean).join(" ")}>
      {caption || actions ? (
        <figcaption className={styles.bar}>
          <span className={styles.caption}>{caption}</span>
          {actions ? <span className={styles.actions}>{actions}</span> : null}
        </figcaption>
      ) : null}
      <pre className={styles.pre} style={maxHeight ? { maxHeight } : undefined} tabIndex={0}>
        <code>
          {lines.map((line, index) => (
            <span key={index} className={styles.line}>
              {lineNumbers ? (
                <span className={styles.number} aria-hidden="true">
                  {firstLine + index}
                </span>
              ) : null}
              <span className={styles.text}>
                {line.tokens.length === 0
                  ? "\u200b"
                  : line.tokens.map((token, at) =>
                      token.className ? (
                        <span key={at} className={token.className}>
                          {token.text}
                        </span>
                      ) : (
                        token.text
                      ),
                    )}
              </span>
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
});
