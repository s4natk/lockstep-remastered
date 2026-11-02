import type { Hazard } from "@lockstep/shared";

import { hazardKey } from "../../lib/hazards";
import { byteOffsetMapper, lineColumnAt } from "../../lib/offsets";
import type { ReviewRecord } from "../../lib/review";
import type { EditorHazard } from "./editor/hazardField";

export function editorHazards(record: Pick<ReviewRecord, "sql" | "parse">): EditorHazard[] {
  if (record.parse === undefined) {
    return [];
  }
  const toChar = byteOffsetMapper(record.sql);
  return record.parse.hazards.map((hazard, index) => ({
    key: hazardKey(hazard, index),
    from: toChar(hazard.start),
    to: toChar(hazard.end),
    code: hazard.code,
    reason: hazard.reason,
    statement: hazard.statementIndex,
  }));
}

export function hazardLine(sql: string, hazard: Hazard): number {
  return lineColumnAt(sql, byteOffsetMapper(sql)(hazard.start)).line;
}
