"use client";
import { useMemo, type ReactNode } from "react";
import { parseMarkdown, type Inline } from "../../lib/markdown";
import { CopyControl } from "./Primitives";
function inline(nodes: Inline[]): ReactNode {
  return nodes.map((node, index) =>
    node.type === "text" ? (
      node.text
    ) : node.type === "code" ? (
      <code key={index}>{node.text}</code>
    ) : node.type === "link" ? (
      <a key={index} href={node.href} target="_blank" rel="noreferrer">
        {inline(node.children)}
      </a>
    ) : node.type === "strong" ? (
      <strong key={index}>{inline(node.children)}</strong>
    ) : (
      <em key={index}>{inline(node.children)}</em>
    ),
  );
}
function highlight(code: string, language: string): ReactNode {
  if (!/^(javascript|js|typescript|ts|python|py|rust|rs|java|sql|json|bash|sh)$/.test(language))
    return code;
  const pattern =
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/[^\n]*|#[^\n]*|\b(?:const|let|var|function|return|async|await|if|else|throw|new|class|import|from|def|try|except|raise|None|True|False|pub|fn|let|mut|impl|use|SELECT|FROM|WHERE|ALTER|TABLE|DROP|CREATE|INDEX|NOT|NULL|true|false|null)\b|\b\d+(?:\.\d+)?\b)/g;
  return code.split(pattern).map((part, index) => {
    const token =
      part.startsWith('"') || part.startsWith("'")
        ? "string"
        : part.startsWith("//") || part.startsWith("#")
          ? "comment"
          : /^\d/.test(part)
            ? "number"
            : /^[A-Za-z]+$/.test(part)
              ? "keyword"
              : "";
    return token ? (
      <span className={`ls-token-${token}`} key={index}>
        {part}
      </span>
    ) : (
      part
    );
  });
}
export function CodeView({
  code,
  language = "text",
  label,
}: {
  code: string;
  language?: string;
  label?: string;
}) {
  return (
    <div className="ls-code">
      <div className="ls-code-head">
        <span>{label ?? language}</span>
        <CopyControl text={code} label="Copy code" />
      </div>
      <pre tabIndex={0} aria-label={label ?? `${language} code`}>
        <code>{highlight(code, language)}</code>
      </pre>
    </div>
  );
}
export function RichText({ source }: { source: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <div className="ls-rich-text">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading":
            return <h3 key={index}>{inline(block.children)}</h3>;
          case "paragraph":
            return (
              <p key={index}>
                {block.lines.map((line, i) => (
                  <span key={i}>
                    {i > 0 ? <br /> : null}
                    {inline(line)}
                  </span>
                ))}
              </p>
            );
          case "code":
            return <CodeView key={index} code={block.code} language={block.language || "text"} />;
          case "quote":
            return (
              <blockquote key={index}>
                {block.lines.map((line, i) => (
                  <p key={i}>{inline(line)}</p>
                ))}
              </blockquote>
            );
          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag key={index} start={block.ordered ? block.start : undefined}>
                {block.items.map((item, i) => (
                  <li key={i}>{inline(item)}</li>
                ))}
              </Tag>
            );
          }
        }
      })}
    </div>
  );
}
