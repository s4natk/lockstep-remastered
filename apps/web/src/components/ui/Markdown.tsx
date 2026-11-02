"use client";

import { useMemo, type ReactNode } from "react";

import { isSqlLanguage, parseMarkdown, type Block, type Inline } from "../../lib/markdown";
import { CodeBlock } from "./CodeBlock";
import { CopyButton } from "./CopyButton";
import styles from "./Markdown.module.css";

export function Markdown({ source }: { source: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  if (blocks.length === 0) {
    return null;
  }
  return (
    <div className={styles.md}>
      {blocks.map((block, index) => (
        <MarkdownBlock key={index} block={block} />
      ))}
    </div>
  );
}

function MarkdownBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "heading": {
      const Tag = block.level <= 2 ? "h3" : "h4";
      return <Tag className={styles.heading}>{renderInline(block.children)}</Tag>;
    }
    case "paragraph":
      return (
        <p className={styles.paragraph}>
          {block.lines.map((line, index) => (
            <span key={index}>
              {index > 0 ? <br /> : null}
              {renderInline(line)}
            </span>
          ))}
        </p>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={styles.list} start={block.ordered ? block.start : undefined}>
          {block.items.map((item, index) => (
            <li key={index}>{renderInline(item)}</li>
          ))}
        </Tag>
      );
    }
    case "quote":
      return (
        <blockquote className={styles.quote}>
          {block.lines.map((line, index) => (
            <p key={index}>{renderInline(line)}</p>
          ))}
        </blockquote>
      );
    case "code": {
      const sql = isSqlLanguage(block.language, block.code);
      return (
        <CodeBlock
          code={block.code}
          language={sql ? "sql" : "text"}
          caption={block.language || (sql ? "sql" : undefined)}
          actions={<CopyButton text={block.code} label="Copy code" />}
        />
      );
    }
  }
}

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return node.text;
      case "code":
        return (
          <code key={index} className={styles.inline}>
            {node.text}
          </code>
        );
      case "strong":
        return <strong key={index}>{renderInline(node.children)}</strong>;
      case "em":
        return <em key={index}>{renderInline(node.children)}</em>;
      case "link":
        return (
          <a key={index} href={node.href} target="_blank" rel="noreferrer">
            {renderInline(node.children)}
          </a>
        );
    }
  });
}
