import type { Evidence, NormalizedFailureContext, ParseResult } from "@lockstep/shared";

export function addSqlEvidence(
  context: NormalizedFailureContext,
  parsed: ParseResult,
): NormalizedFailureContext {
  const evidence: Evidence[] = parsed.hazards.slice(0, 128).map((hazard, index) => ({
    id: `sql:${index + 1}`,
    kind: "sql_parser",
    label: `SQL statement ${hazard.statementIndex + 1}: ${hazard.code}`,
    content: `${hazard.reason}\n${hazard.sql}`,
    provenance: {
      sourceId: `statement:${hazard.statementIndex}`,
      lineStart: lineAtByte(context.input.rawInput, hazard.start),
      lineEnd: lineAtByte(context.input.rawInput, hazard.end),
    },
  }));
  return {
    ...context,
    warnings: [
      ...context.warnings.filter((warning) => warning.code !== "sql_analysis_required"),
      ...(parsed.hazards.length > 128
        ? [
            {
              code: "sql_hazard_limit",
              message:
                "Only the first 128 SQL hazards are included. Submit a shorter migration for complete review.",
            },
          ]
        : []),
    ],
    findings: [
      ...context.findings,
      ...parsed.hazards
        .slice(0, 128)
        .map((hazard, index) => ({
          id: `sql-finding:${index + 1}`,
          code: `sql_${hazard.code}`,
          message: hazard.reason,
          evidenceIds: [`sql:${index + 1}`],
        })),
    ],
    evidence: [...context.evidence, ...evidence],
    metadata: {
      ...context.metadata,
      sqlStatements: String(parsed.statements.length),
      sqlHazards: String(parsed.hazards.length),
    },
  };
}

function lineAtByte(sql: string, offset: number): number {
  return new TextDecoder()
    .decode(new TextEncoder().encode(sql).slice(0, offset))
    .split(/\r\n|\n|\r/).length;
}
