import type { Citation, Hazard } from "@lockstep/shared";

export interface CitedNote {
  note: string;
  citations: Citation[];
  dropped: string[];
}

export function checkCitations(input: {
  note: string;
  hazards: Hazard[];
  chunks: Array<{ id: string; text: string }>;
  citations: Citation[];
}): CitedNote {
  const grounded = input.citations.filter((citation) =>
    isGrounded(citation, input.hazards, input.chunks),
  );
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const sentence of sentences(input.note)) {
    if (grounded.some((citation) => sentence.includes(citation.quote.trim()))) {
      kept.push(sentence);
    } else {
      dropped.push(sentence);
    }
  }
  const keptNote = kept.join(" ");
  return {
    note: keptNote,
    citations: grounded.filter((citation) => keptNote.includes(citation.quote.trim())),
    dropped,
  };
}

function isGrounded(
  citation: Citation,
  hazards: Hazard[],
  chunks: Array<{ id: string; text: string }>,
): boolean {
  const quote = citation.quote.trim();
  if (quote.length === 0) {
    return false;
  }
  if (citation.kind === "parser") {
    const index = statementIndex(citation.sourceId);
    if (index === undefined) {
      return false;
    }
    return hazards.some(
      (hazard) =>
        hazard.statementIndex === index &&
        (hazard.sql.includes(quote) || hazard.reason.includes(quote)),
    );
  }
  const chunk = chunks.find((candidate) => candidate.id === citation.sourceId);
  return chunk !== undefined && chunk.text.includes(quote);
}

function statementIndex(sourceId: string): number | undefined {
  const match = /^statement:(\d+)$/.exec(sourceId);
  const digits = match?.[1];
  if (digits === undefined) {
    return undefined;
  }
  return Number(digits);
}

function sentences(note: string): string[] {
  return note
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}
