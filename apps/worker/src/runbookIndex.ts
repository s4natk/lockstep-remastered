const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "before",
  "can",
  "do",
  "for",
  "how",
  "is",
  "it",
  "my",
  "of",
  "on",
  "or",
  "the",
  "to",
  "what",
  "when",
  "why",
]);

export interface SearchableChunk {
  id: string;
  text: string;
}

export function searchRunbooks(
  chunks: SearchableChunk[],
  query: string,
  limit = 3,
): SearchableChunk[] {
  const queryTokens = indexTokens(query);
  return chunks
    .map((chunk) => ({ chunk, score: overlap(queryTokens, indexTokens(chunk.text)) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.chunk.id.localeCompare(right.chunk.id);
    })
    .slice(0, limit)
    .map((entry) => entry.chunk);
}

export function indexTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function overlap(queryTokens: string[], textTokens: string[]): number {
  const haystack = new Set(textTokens);
  let score = 0;
  for (const token of new Set(queryTokens)) {
    if (haystack.has(token)) {
      score += 2;
      continue;
    }
    if ([...haystack].some((word) => word.startsWith(token) && token.length >= 4)) {
      score += 1;
    }
  }
  return score;
}
