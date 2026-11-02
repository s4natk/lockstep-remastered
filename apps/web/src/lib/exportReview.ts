import { contextIndexOf, linkSentences } from "./citations";
import { hazardLabel } from "./hazards";
import { byteOffsetMapper, lineColumnAt } from "./offsets";
import type { ReviewRecord } from "./review";

export function reviewFileName(record: ReviewRecord, extension: "md" | "json"): string {
  const stamp = new Date(record.createdAt).toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return `lockstep-review-${stamp}.${extension}`;
}

export function reviewToJson(record: ReviewRecord): string {
  return JSON.stringify(
    {
      sessionId: record.id,
      reviewedAt: new Date(record.createdAt).toISOString(),
      sql: record.sql,
      statements: record.parse?.statements ?? [],
      hazards: record.parse?.hazards ?? [],
      note: record.note ?? null,
      citations: record.citations ?? [],
      removedByCitationCheck: record.dropped ?? null,
      context: record.context ?? null,
      trace: record.trace ?? [],
    },
    null,
    2,
  );
}

export function reviewToMarkdown(record: ReviewRecord): string {
  const lines: string[] = [];
  const statements = record.parse?.statements ?? [];
  const hazards = record.parse?.hazards ?? [];
  const citations = record.citations ?? [];
  const toChar = byteOffsetMapper(record.sql);

  lines.push("# Lockstep review", "");
  lines.push(`- Session: \`${record.id}\``);
  lines.push(`- Reviewed: ${new Date(record.createdAt).toISOString()}`);
  lines.push(`- Statements: ${statements.length}`);
  lines.push(`- Parser hazards: ${hazards.length}`);
  lines.push("", "## Migration", "", fence(record.sql, "sql"), "");

  lines.push("## Parser findings", "", "Deterministic output from the Rust/Wasm parser.", "");
  if (hazards.length === 0) {
    lines.push("The parser reported no hazards.", "");
  } else {
    lines.push("| Statement | Line | Hazard | Reason |", "| --- | --- | --- | --- |");
    for (const hazard of hazards) {
      const { line } = lineColumnAt(record.sql, toChar(hazard.start));
      lines.push(
        `| ${hazard.statementIndex + 1} | ${line} | ${hazardLabel(hazard.code)} | ${escapeCell(hazard.reason)} |`,
      );
    }
    lines.push("");
  }

  lines.push("## Rollout note", "");
  lines.push("Drafted by the language model. Sentences that did not quote a source were removed.", "");
  const sentences = linkSentences(record.note ?? "", citations);
  if (sentences.length === 0) {
    lines.push("No sentences passed the citation check.", "");
  } else {
    sentences.forEach((sentence, index) => {
      const refs = sentence.sources.map((source) => `[${source + 1}]`).join("");
      lines.push(`${index + 1}. ${sentence.text}${refs ? ` ${refs}` : ""}`);
    });
    lines.push("");
  }

  if (citations.length > 0) {
    lines.push("## Sources", "");
    citations.forEach((citation, index) => {
      lines.push(`${index + 1}. ${citation.kind} \`${citation.sourceId}\`: "${citation.quote}"`);
    });
    lines.push("");
  }

  if (record.dropped && record.dropped.length > 0) {
    lines.push("## Removed by the citation check", "");
    for (const sentence of record.dropped) {
      lines.push(`- ${sentence}`);
    }
    lines.push("");
  }

  if (record.context && record.context.length > 0) {
    lines.push("## Context sent with the review", "");
    record.context.forEach((entry, index) => {
      const cited = citations.some((citation) => contextIndexOf(citation.sourceId) === index);
      const title = entry.title ? ` (${entry.title})` : "";
      lines.push(`- \`context-${index}\`${title}${cited ? ", cited" : ""}: ${entry.text}`);
    });
    lines.push("");
  }

  if (record.trace && record.trace.length > 0) {
    lines.push("## Trace", "", "| Span | Duration |", "| --- | --- |");
    for (const span of record.trace) {
      lines.push(`| \`${span.name}\` | ${span.durationMs.toFixed(1)} ms |`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function fence(code: string, language: string): string {
  const longest = Math.max(2, ...(code.match(/`+/g) ?? []).map((run) => run.length));
  const ticks = "`".repeat(longest + 1);
  return `${ticks}${language}\n${code}\n${ticks}`;
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
