import {
  normalizeFailure,
  type InvestigationInput,
  type InvestigationProgress,
  type InvestigationReport,
  type NormalizedFailureContext,
  type ParseResult,
  type WorkflowStage,
} from "@lockstep/shared";
import type { Env } from "./env.js";
import { addSqlEvidence } from "./investigationEvidence.js";
import { deterministicDraft } from "./investigationGuidance.js";
import { createInvestigationModel, type InvestigationModel } from "./investigationModel.js";
import { investigationReport } from "./investigationReport.js";
import {
  retrieveInvestigationEvidence,
  type InvestigationRetrieval,
} from "./investigationRetrieval.js";
import { validateInvestigationDraft } from "./investigationValidation.js";

export interface InvestigationDependencies {
  env: Pick<Env, "OPENAI_API_KEY" | "OPENAI_MODEL" | "VECTORIZE">;
  parseSql: (sql: string) => Promise<ParseResult>;
  model?: InvestigationModel;
  retrieve?: (
    context: NormalizedFailureContext,
    signal?: AbortSignal,
  ) => Promise<InvestigationRetrieval>;
  onProgress?: (event: InvestigationProgress) => void | Promise<void>;
  signal?: AbortSignal;
  sessionId: string;
  createdAt: string;
}

export async function investigateFailure(
  input: InvestigationInput,
  deps: InvestigationDependencies,
): Promise<InvestigationReport> {
  const timings: Array<{ stage: WorkflowStage; durationMs: number }> = [];
  let active: { stage: WorkflowStage; started: number } | undefined;
  const progress = async (stage: WorkflowStage, message: string) => {
    if (active)
      timings.push({
        stage: active.stage,
        durationMs: Math.max(0, performance.now() - active.started),
      });
    active = { stage, started: performance.now() };
    deps.signal?.throwIfAborted();
    await deps.onProgress?.({
      schemaVersion: 1,
      sessionId: deps.sessionId,
      stage,
      message,
      timestamp: new Date().toISOString(),
    });
  };
  await progress("parsing", "Extracting observations and original evidence");
  let context = normalizeFailure(input);
  if (context.kind === "sql_migration") {
    try {
      context = addSqlEvidence(context, await deps.parseSql(input.rawInput));
    } catch {
      context.warnings.push({
        code: "sql_parse_failed",
        message:
          "The SQL parser could not parse this migration. No SQL hazard analysis is available for the malformed excerpt.",
      });
    }
  }
  await progress("retrieving", "Retrieving relevant troubleshooting context");
  try {
    const retrieval = await (
      deps.retrieve ?? ((value, signal) => retrieveInvestigationEvidence(value, deps.env, signal))
    )(context, deps.signal);
    context = {
      ...context,
      evidence: [...context.evidence, ...retrieval.evidence],
      warnings: [...context.warnings, ...retrieval.warnings],
      metadata: { ...context.metadata, retrievalMode: retrieval.mode },
    };
  } catch {
    deps.signal?.throwIfAborted();
    context.warnings.push({
      code: "retrieval_unavailable",
      message: "Retrieval was unavailable. The report uses submitted evidence only.",
    });
  }
  await progress("investigating", "Assessing likely causes and safe next steps");
  let draft = deterministicDraft(context);
  let mode: "ai" | "deterministic" = "deterministic";
  const model =
    deps.model ??
    (deps.env.OPENAI_API_KEY?.trim()
      ? createInvestigationModel(deps.env.OPENAI_API_KEY, { model: deps.env.OPENAI_MODEL })
      : undefined);
  if (model) {
    try {
      const candidate = await model.investigate(context, deps.signal);
      if (!validateInvestigationDraft(candidate, context)) throw new Error("Invalid report");
      draft = candidate;
      mode = "ai";
    } catch {
      deps.signal?.throwIfAborted();
      context.warnings.push({
        code: "provider_fallback",
        message:
          "The AI provider was unavailable or returned an invalid report. Deterministic observations and guidance are shown instead.",
      });
    }
  } else
    context.warnings.push({
      code: "provider_not_configured",
      message:
        "No AI provider credentials are configured. This report contains deterministic observations and investigation guidance.",
    });
  await progress("validating_evidence", "Validating report structure and evidence references");
  const report = investigationReport(context, draft, {
    sessionId: deps.sessionId,
    createdAt: deps.createdAt,
    mode,
  });
  if (active)
    timings.push({
      stage: active.stage,
      durationMs: Math.max(0, performance.now() - active.started),
    });
  return { ...report, trace: timings };
}
