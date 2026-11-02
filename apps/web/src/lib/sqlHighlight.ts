import { PostgreSQL } from "@codemirror/lang-sql";
import { highlightCode, tagHighlighter, tags } from "@lezer/highlight";

/** One highlighter for the editor and for static SQL, so both use the same token classes. */
export const sqlHighlighter = tagHighlighter([
  { tag: tags.keyword, class: "tok-keyword" },
  { tag: tags.typeName, class: "tok-type" },
  { tag: tags.standard(tags.name), class: "tok-builtin" },
  { tag: [tags.string, tags.special(tags.string)], class: "tok-string" },
  { tag: [tags.number, tags.bool, tags.null], class: "tok-number" },
  { tag: tags.comment, class: "tok-comment" },
  { tag: tags.operator, class: "tok-operator" },
  { tag: [tags.punctuation, tags.paren, tags.brace, tags.squareBracket], class: "tok-punct" },
  { tag: tags.special(tags.name), class: "tok-variable" },
  { tag: tags.name, class: "tok-name" },
]);

export interface HighlightedLine {
  tokens: Array<{ text: string; className: string }>;
}

export function highlightSql(code: string): HighlightedLine[] {
  const tree = PostgreSQL.language.parser.parse(code);
  const lines: HighlightedLine[] = [{ tokens: [] }];
  highlightCode(
    code,
    tree,
    sqlHighlighter,
    (text, className) => {
      lines[lines.length - 1]!.tokens.push({ text, className });
    },
    () => {
      lines.push({ tokens: [] });
    },
  );
  return lines;
}
