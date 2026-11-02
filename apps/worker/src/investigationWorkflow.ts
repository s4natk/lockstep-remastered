import { Document } from "@langchain/core/documents";
import { BaseRetriever } from "@langchain/core/retrievers";
import { RunnableSequence } from "@langchain/core/runnables";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import {
  normalizeFailure,
  type Evidence,
  type InvestigationInput,
  type InvestigationProgress,
  type InvestigationReport,
  type NormalizedFailureContext,
  type ParseResult,
  type WorkflowStage,
} from "@lockstep/shared";
import type { Env } from "./env.js";
import { addSqlEvidence } from "./investigationEvidence.js";
import {
  deterministicDraft,
  deterministicAnswer,
  type InvestigationDraft,
} from "./investigationGuidance.js";
import {
  createInvestigationModel,
  type ConversationMessage,
  type InvestigationModel,
} from "./investigationModel.js";
import { investigationQueries } from "./investigationQueries.js";
import { investigationReport } from "./investigationReport.js";
import {
  retrieveInvestigationEvidence,
  type InvestigationRetrieval,
} from "./investigationRetrieval.js";
import { validateInvestigationDraft } from "./investigationValidation.js";
import { providerConfig, type ProviderEnvironment } from "./providerConfig.js";
import { providerFailureWarning } from "./providerFailure.js";

export interface InvestigationDependencies {
  env: Pick<Env, "VECTORIZE"> & ProviderEnvironment;
  parseSql: (sql: string) => Promise<ParseResult>;
  model?: InvestigationModel;
  retrieve?: (
    context: NormalizedFailureContext,
    signal?: AbortSignal,
    query?: string,
  ) => Promise<InvestigationRetrieval>;
  onProgress?: (event: InvestigationProgress) => void | Promise<void>;
  onText?: (delta: string) => void | Promise<void>;
  conversation?: ConversationMessage[];
  question?: string;
  contextEvidence?: Evidence[];
  signal?: AbortSignal;
  sessionId: string;
  createdAt: string;
}

const InvestigationState = Annotation.Root({
  input: Annotation<InvestigationInput>,
  context: Annotation<NormalizedFailureContext | null>({
    reducer: (_previous, next) => next,
    default: () => null,
  }),
  draft: Annotation<InvestigationDraft | null>({
    reducer: (_previous, next) => next,
    default: () => null,
  }),
  mode: Annotation<"ai" | "deterministic">({
    reducer: (_previous, next) => next,
    default: () => "deterministic",
  }),
  report: Annotation<InvestigationReport | null>({
    reducer: (_previous, next) => next,
    default: () => null,
  }),
});

class InvestigationEvidenceRetriever extends BaseRetriever {
  lc_namespace = ["lockstep", "retrievers"];
  private readonly retrieveEvidence: (query: string) => Promise<Evidence[]>;
  constructor(retrieveEvidence: (query: string) => Promise<Evidence[]>) {
    super({});
    this.retrieveEvidence = retrieveEvidence;
  }
  async _getRelevantDocuments(query: string): Promise<Document[]> {
    return (await this.retrieveEvidence(query)).map(
      (evidence) => new Document({ pageContent: evidence.content, metadata: { evidence } }),
    );
  }
}

function requireContext(context: NormalizedFailureContext | null): NormalizedFailureContext {
  if (!context) throw new Error("Investigation graph is missing normalized context");
  return context;
}

function mergeEvidence(
  context: NormalizedFailureContext,
  additional: readonly Evidence[],
): NormalizedFailureContext {
  const evidence = [...context.evidence];
  const known = new Map(evidence.map((item) => [item.id, item]));
  const warnings = [...context.warnings];
  let addedCharacters = 0;
  let added = 0;
  let bounded = false;
  for (const item of additional) {
    const previous = known.get(item.id);
    if (previous) {
      if (
        previous.content !== item.content &&
        !warnings.some((warning) => warning.code === "evidence_identity_conflict")
      )
        warnings.push({
          code: "evidence_identity_conflict",
          message:
            "Conflicting source identifiers were discarded; original source identity was preserved.",
        });
      continue;
    }
    if (added >= 64 || addedCharacters + item.content.length > 60_000) {
      bounded = true;
      continue;
    }
    evidence.push(item);
    known.set(item.id, item);
    added += 1;
    addedCharacters += item.content.length;
  }
  if (bounded)
    warnings.push({
      code: "context_limit",
      message: "Some supplied context exceeded the investigation context limit and was omitted.",
    });
  return { ...context, evidence, warnings };
}

export function compileInvestigationGraph(deps: InvestigationDependencies) {
  const timings: Array<{ stage: WorkflowStage; durationMs: number }> = [];
  let active: { stage: WorkflowStage; started: number } | undefined;
  const progress = async (stage: WorkflowStage, message: string) => {
    deps.signal?.throwIfAborted();
    if (active)
      timings.push({
        stage: active.stage,
        durationMs: Math.max(0, performance.now() - active.started),
      });
    active = { stage, started: performance.now() };
    await deps.onProgress?.({
      schemaVersion: 1,
      sessionId: deps.sessionId,
      stage,
      message,
      timestamp: new Date().toISOString(),
    });
  };
  return new StateGraph(InvestigationState)
    .addNode("normalize_failure", async (state) => {
      await progress("parsing", "Extracting observations and original evidence");
      return { context: mergeEvidence(normalizeFailure(state.input), deps.contextEvidence ?? []) };
    })
    .addNode("analyze_sql", async (state) => {
      const context = requireContext(state.context);
      try {
        return { context: addSqlEvidence(context, await deps.parseSql(state.input.rawInput)) };
      } catch {
        deps.signal?.throwIfAborted();
        return {
          context: {
            ...context,
            warnings: [
              ...context.warnings,
              {
                code: "sql_parse_failed",
                message:
                  "The SQL parser could not parse this migration. No SQL hazard analysis is available for the malformed excerpt.",
              },
            ],
          },
        };
      }
    })
    .addNode("retrieve_evidence", async (state) => {
      await progress("retrieving", "Retrieving relevant troubleshooting context");
      const context = requireContext(state.context);
      const query = [investigationQueries(context)[0]?.text ?? context.kind, deps.question ?? ""]
        .join(" ")
        .slice(0, 1600);
      let retrieval: InvestigationRetrieval | undefined;
      try {
        const retriever = new InvestigationEvidenceRetriever(async (text) => {
          retrieval = await (
            deps.retrieve ??
            ((value, signal, override) =>
              retrieveInvestigationEvidence(value, deps.env, signal, override))
          )(
            { ...context, metadata: { ...context.metadata, retrievalQuery: text } },
            deps.signal,
            text,
          );
          return retrieval.evidence;
        });
        const chain = RunnableSequence.from([
          retriever,
          (documents: Document[]) =>
            documents.map((document) => document.metadata.evidence as Evidence),
        ]);
        const evidence = await chain.invoke(query, { signal: deps.signal });
        const merged = mergeEvidence(context, evidence);
        return {
          context: {
            ...merged,
            warnings: [...merged.warnings, ...(retrieval?.warnings ?? [])],
            metadata: { ...merged.metadata, retrievalMode: retrieval?.mode ?? "keyword" },
          },
        };
      } catch {
        deps.signal?.throwIfAborted();
        return {
          context: {
            ...context,
            warnings: [
              ...context.warnings,
              {
                code: "retrieval_unavailable",
                message:
                  "Retrieval was unavailable. The report uses submitted evidence and supplied context only.",
              },
            ],
          },
        };
      }
    })
    .addNode("investigate_cause", async (state) => {
      await progress("investigating", "Assessing the current question against the evidence");
      let context = requireContext(state.context);
      const turn = { conversation: deps.conversation, question: deps.question };
      let draft = deterministicDraft(context, turn);
      let mode: "ai" | "deterministic" = "deterministic";
      let emitted = false;
      const onText = async (delta: string) => {
        if (delta) {
          emitted = true;
          await deps.onText?.(delta);
        }
      };
      try {
        const config = providerConfig(deps.env);
        const model =
          deps.model ??
          (config.apiKey ? createInvestigationModel(config.apiKey, config) : undefined);
        if (model) {
          const candidate = await model.investigate(context, deps.signal, { ...turn, onText });
          if (!validateInvestigationDraft(candidate, context))
            throw new Error("provider_invalid_report");
          draft = {
            ...candidate,
            assistantAnswer: candidate.assistantAnswer ?? deterministicAnswer(context, turn),
          };
          mode = "ai";
        } else
          context = {
            ...context,
            warnings: [
              ...context.warnings,
              {
                code: "provider_not_configured",
                message:
                  "No AI provider credentials are configured. This report contains deterministic observations and investigation guidance.",
              },
            ],
          };
      } catch (error) {
        deps.signal?.throwIfAborted();
        context = {
          ...context,
          warnings: [
            ...context.warnings,
            providerFailureWarning(error),
            {
              code: "provider_fallback",
              message:
                "The AI provider was unavailable or returned an invalid report. Deterministic observations and guidance replace any provisional text.",
            },
          ],
        };
        emitted = false;
      }
      if (!emitted && draft.assistantAnswer) await onText(draft.assistantAnswer);
      return { context, draft, mode };
    })
    .addNode("validate_report", async (state) => {
      await progress("validating_evidence", "Validating report structure and evidence references");
      const context = requireContext(state.context);
      if (!state.draft || !validateInvestigationDraft(state.draft, context))
        throw new Error("The investigation report failed validation");
      const report = investigationReport(context, state.draft, {
        sessionId: deps.sessionId,
        createdAt: deps.createdAt,
        mode: state.mode,
      });
      if (active)
        timings.push({
          stage: active.stage,
          durationMs: Math.max(0, performance.now() - active.started),
        });
      active = undefined;
      return { report: { ...report, trace: timings } };
    })
    .addEdge(START, "normalize_failure")
    .addConditionalEdges(
      "normalize_failure",
      (state) => (requireContext(state.context).kind === "sql_migration" ? "sql" : "other"),
      { sql: "analyze_sql", other: "retrieve_evidence" },
    )
    .addEdge("analyze_sql", "retrieve_evidence")
    .addEdge("retrieve_evidence", "investigate_cause")
    .addEdge("investigate_cause", "validate_report")
    .addEdge("validate_report", END)
    .compile();
}

export async function investigateFailure(
  input: InvestigationInput,
  deps: InvestigationDependencies,
): Promise<InvestigationReport> {
  deps.signal?.throwIfAborted();
  const state = await compileInvestigationGraph(deps).invoke({ input }, { signal: deps.signal });
  if (!state.report) throw new Error("The investigation graph ended without a report");
  return state.report;
}
