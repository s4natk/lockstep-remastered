import type { Hazard, HazardCode, ParseResult } from "@lockstep/shared";

export interface HazardMeta {
  code: HazardCode;
  label: string;
}

export const HAZARD_META: Record<HazardCode, HazardMeta> = {
  data_loss: { code: "data_loss", label: "Data loss" },
  lock_risk: { code: "lock_risk", label: "Lock risk" },
  rewrite: { code: "rewrite", label: "Table rewrite" },
  safe: { code: "safe", label: "No hazard" },
};

export const HAZARD_ORDER: HazardCode[] = ["data_loss", "rewrite", "lock_risk", "safe"];

export function hazardLabel(code: HazardCode): string {
  return HAZARD_META[code]?.label ?? code;
}

export function hazardCounts(parse: ParseResult | undefined): Array<{ code: HazardCode; count: number }> {
  if (parse === undefined) {
    return [];
  }
  const counts = new Map<HazardCode, number>();
  for (const hazard of parse.hazards) {
    counts.set(hazard.code, (counts.get(hazard.code) ?? 0) + 1);
  }
  return HAZARD_ORDER.flatMap((code) => {
    const count = counts.get(code);
    return count === undefined ? [] : [{ code, count }];
  });
}

export function hazardsByStatement(parse: ParseResult): Map<number, Hazard[]> {
  const grouped = new Map<number, Hazard[]>();
  for (const hazard of parse.hazards) {
    const list = grouped.get(hazard.statementIndex) ?? [];
    list.push(hazard);
    grouped.set(hazard.statementIndex, list);
  }
  return grouped;
}

export function hazardKey(hazard: Hazard, index: number): string {
  return `${hazard.statementIndex}:${hazard.code}:${index}`;
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
