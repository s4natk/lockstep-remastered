// A small Markdown subset for assistant replies. It produces a plain tree that is
// rendered as React elements, so model output never reaches the DOM as HTML.

export type Inline =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "paragraph"; lines: Inline[][] }
  | { type: "heading"; level: number; children: Inline[] }
  | { type: "list"; ordered: boolean; start: number; items: Inline[][] }
  | { type: "code"; language: string; code: string; closed: boolean }
  | { type: "quote"; lines: Inline[][] };

const FENCE = /^(\s*)(`{3,}|~{3,})\s*([\w+-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[2]!;
      const body: string[] = [];
      index += 1;
      let closed = false;
      while (index < lines.length) {
        if (lines[index]!.trim().startsWith(marker) && lines[index]!.trim().replace(/[`~]/g, "") === "") {
          closed = true;
          index += 1;
          break;
        }
        body.push(lines[index]!);
        index += 1;
      }
      blocks.push({ type: "code", language: fence[3]!.toLowerCase(), code: body.join("\n"), closed });
      continue;
    }

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1]!.length, children: parseInline(heading[2]!) });
      index += 1;
      continue;
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      const ordered = ORDERED.test(line);
      const start = ordered ? Number(ORDERED.exec(line)![1]) : 1;
      const items: Inline[][] = [];
      while (index < lines.length) {
        const match = ordered ? ORDERED.exec(lines[index]!) : BULLET.exec(lines[index]!);
        if (!match) {
          break;
        }
        items.push(parseInline(ordered ? match[2]! : match[1]!));
        index += 1;
      }
      blocks.push({ type: "list", ordered, start, items });
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: Inline[][] = [];
      while (index < lines.length && QUOTE.test(lines[index]!)) {
        quoted.push(parseInline(QUOTE.exec(lines[index]!)![1]!));
        index += 1;
      }
      blocks.push({ type: "quote", lines: quoted });
      continue;
    }

    const paragraph: Inline[][] = [];
    while (index < lines.length) {
      const next = lines[index]!;
      if (
        next.trim() === "" ||
        FENCE.test(next) ||
        HEADING.test(next) ||
        BULLET.test(next) ||
        ORDERED.test(next) ||
        QUOTE.test(next)
      ) {
        break;
      }
      paragraph.push(parseInline(next));
      index += 1;
    }
    blocks.push({ type: "paragraph", lines: paragraph });
  }

  return blocks;
}

export function parseInline(text: string): Inline[] {
  const nodes: Inline[] = [];
  let buffer = "";
  let index = 0;

  const flush = () => {
    if (buffer !== "") {
      nodes.push({ type: "text", text: buffer });
      buffer = "";
    }
  };

  while (index < text.length) {
    const char = text[index]!;

    if (char === "`") {
      const close = text.indexOf("`", index + 1);
      if (close > index + 1) {
        flush();
        nodes.push({ type: "code", text: text.slice(index + 1, close) });
        index = close + 1;
        continue;
      }
    }

    if ((char === "*" || char === "_") && text[index + 1] === char) {
      const marker = char + char;
      const close = text.indexOf(marker, index + 2);
      if (close > index + 2) {
        flush();
        nodes.push({ type: "strong", children: parseInline(text.slice(index + 2, close)) });
        index = close + 2;
        continue;
      }
    }

    if ((char === "*" || char === "_") && text[index + 1] !== char && text[index + 1] !== " ") {
      const close = text.indexOf(char, index + 1);
      const boundary = char === "_" ? /\w/.test(text[index - 1] ?? "") : false;
      if (close > index + 1 && !boundary && text[close - 1] !== " ") {
        flush();
        nodes.push({ type: "em", children: parseInline(text.slice(index + 1, close)) });
        index = close + 1;
        continue;
      }
    }

    if (char === "[") {
      const match = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/.exec(text.slice(index));
      if (match) {
        flush();
        nodes.push({ type: "link", href: match[2]!, children: parseInline(match[1]!) });
        index += match[0].length;
        continue;
      }
    }

    buffer += char;
    index += 1;
  }

  flush();
  return nodes;
}

export function looksLikeSql(code: string): boolean {
  return /^\s*(--.*\n\s*)*(ALTER|CREATE|DROP|TRUNCATE|INSERT|UPDATE|DELETE|SELECT|WITH|BEGIN|SET|COMMENT|GRANT|REVOKE)\b/i.test(
    code,
  );
}

export function isSqlLanguage(language: string, code: string): boolean {
  if (["sql", "postgres", "postgresql", "psql", "pgsql", "plpgsql"].includes(language)) {
    return true;
  }
  return language === "" && looksLikeSql(code);
}
