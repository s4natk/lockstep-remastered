import type { Citation } from "@lockstep/shared";

/** Same sentence split as the Worker's citation checker. */
export function splitSentences(note: string): string[] {
  return note
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

export interface NoteSentence {
  text: string;
  /** Indexes into the citation list whose quote appears in this sentence. */
  sources: number[];
}

export function linkSentences(note: string, citations: Citation[]): NoteSentence[] {
  return splitSentences(note).map((text) => ({
    text,
    sources: citations.flatMap((citation, index) => {
      const quote = citation.quote.trim();
      return quote.length > 0 && text.includes(quote) ? [index] : [];
    }),
  }));
}

/** Parser citations use `statement:N` (zero-based). */
export function statementIndexOf(sourceId: string): number | null {
  const match = /^statement:(\d+)$/.exec(sourceId);
  return match ? Number(match[1]) : null;
}

/** Context citations use `context-N`, the position in the context list sent with the review. */
export function contextIndexOf(sourceId: string): number | null {
  const match = /^context-(\d+)$/.exec(sourceId);
  return match ? Number(match[1]) : null;
}
