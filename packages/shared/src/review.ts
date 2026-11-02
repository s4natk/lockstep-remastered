import type { Hazard } from "./parse.js";

export type CitationKind = "parser" | "runbook" | "context";

export interface Citation {
  kind: CitationKind;
  quote: string;
  sourceId: string;
}

export interface Review {
  sessionId: string;
  note: string;
  hazards: Hazard[];
  citations: Citation[];
}
