export type HazardCode = "safe" | "lock_risk" | "data_loss" | "rewrite";

export interface ParsedStatement {
  index: number;
  sql: string;
  start: number;
  end: number;
}

export interface Hazard {
  code: HazardCode;
  statementIndex: number;
  start: number;
  end: number;
  sql: string;
  reason: string;
}

export interface ParseResult {
  statements: ParsedStatement[];
  hazards: Hazard[];
}
