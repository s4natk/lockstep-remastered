import { ChatPromptTemplate } from "@langchain/core/prompts";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { Citation, Hazard, ParseResult, RunbookChunk } from "@lockstep/shared";

import { checkCitations } from "./citationCheck.js";
import { streamOpenAiChat } from "./openaiChat.js";
import { traceMark, traceSince, withSpan, type TraceSummary } from "./tracing.js";

const ReviewState = Annotation.Root({
  sql: Annotation<string>,
  context: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  hazards: Annotation<Hazard[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  chunks: Annotation<RunbookChunk[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  note: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  citations: Annotation<Citation[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  dropped: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
});

export const draftPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You write a Postgres rollout note. Describe only hazards the parser returned. Every sentence must quote a parser reason, a runbook chunk, or a user context snippet exactly. User context is included with the runbooks and labeled context-N.",
  ],
  ["human", "SQL:\n{sql}\n\nHazards:\n{hazards}\n\nRunbooks:\n{runbooks}"],
]);

export interface DraftInput {
  prompt: string;
  hazards: Hazard[];
  chunks: RunbookChunk[];
}

export interface ReviewModel {
  stream(input: DraftInput): AsyncIterable<string>;
}

export type ReviewStage = "retrieve" | "draft";

export interface ReviewGraphDeps {
  parse: (sql: string) => Promise<ParseResult>;
  search: (query: string) => Promise<RunbookChunk[]>;
  model: ReviewModel;
  onToken?: (token: string) => void;
  onStage?: (stage: ReviewStage) => void;
}

export function mockReviewModel(): ReviewModel {
  return {
    async *stream(input) {
      const text = [
        ...input.hazards.map((hazard) => withPeriod(hazard.reason)),
        ...input.chunks.map((chunk) => firstSentence(chunk.text)),
        "Ship this on Friday without a backup.",
      ].join(" ");
      for (const part of text.split(/(\s+)/)) {
        if (part.length > 0) {
          yield part;
        }
      }
    },
  };
}

export function createReviewModel(apiKey: string | undefined, fetchImpl: typeof fetch = fetch): ReviewModel {
  if (apiKey === undefined || apiKey === "") {
    return mockReviewModel();
  }
  return {
    async *stream(input) {
      yield* streamOpenAiChat({ apiKey, prompt: input.prompt, fetchImpl });
    },
  };
}

export function compileReviewGraph(deps: ReviewGraphDeps) {
  return new StateGraph(ReviewState)
    .addNode("parse_migration", async (state) => {
      const parsed = await withSpan("wasm.parse", () => deps.parse(state.sql));
      return { hazards: parsed.hazards };
    })
    .addNode("search_runbooks", async (state) => {
      deps.onStage?.("retrieve");
      const query = state.hazards.map((hazard) => hazard.reason).join(" ") || state.sql;
      const retrieved = await withSpan("retrieval.hybrid", () => deps.search(query));
      const extra = state.context.map((text, index) => ({ id: `context-${index}`, text }));
      return { chunks: [...extra, ...retrieved] };
    })
    .addNode("draft", async (state) => {
      deps.onStage?.("draft");
      const formatted = await draftPrompt.formatMessages({
        sql: state.sql,
        hazards: state.hazards.map((hazard) => `- ${hazard.reason}`).join("\n") || "none",
        runbooks: state.chunks.map((chunk) => `[${chunk.id}] ${chunk.text}`).join("\n\n") || "none",
      });
      const prompt = formatted.map((message) => messageText(message.content)).join("\n");
      const draft = await withSpan("review.draft", async () => {
        let text = "";
        for await (const token of deps.model.stream({
          prompt,
          hazards: state.hazards,
          chunks: state.chunks,
        })) {
          text += token;
          deps.onToken?.(token);
        }
        return text;
      });
      const checked = checkCitations({
        note: draft,
        hazards: state.hazards,
        chunks: state.chunks,
        citations: citationsFor(state.hazards, state.chunks, draft),
      });
      return {
        note: checked.note,
        citations: checked.citations,
        dropped: checked.dropped,
      };
    })
    .addEdge(START, "parse_migration")
    .addEdge("parse_migration", "search_runbooks")
    .addEdge("search_runbooks", "draft")
    .addEdge("draft", END)
    .compile();
}

export type ReviewStreamEvent =
  | { type: "token"; content: string }
  | { type: "stage"; stage: ReviewStage }
  | {
      type: "done";
      note: string;
      citations: Citation[];
      dropped: string[];
      trace: TraceSummary;
    };

export async function* streamReview(
  sql: string,
  deps: ReviewGraphDeps,
  context: readonly string[] = [],
): AsyncGenerator<ReviewStreamEvent> {
  const mark = traceMark();
  const queue = createQueue<ReviewStreamEvent>();
  const userContext = normalizeContext(context);
  const pending = compileReviewGraph({
    ...deps,
    onToken(token) {
      queue.push({ type: "token", content: token });
    },
    onStage(stage) {
      queue.push({ type: "stage", stage });
    },
  })
    .invoke({ sql, context: userContext })
    .then((state) => {
      queue.push({
        type: "done",
        note: state.note,
        citations: state.citations,
        dropped: state.dropped,
        trace: traceSince(mark),
      });
      queue.close();
    })
    .catch((error: unknown) => {
      queue.fail(error);
    });

  try {
    while (true) {
      const next = await queue.next();
      if (next.done) {
        break;
      }
      yield next.value;
    }
  } finally {
    await pending.catch(() => undefined);
  }
}

export async function reviewMigration(
  sql: string,
  deps: ReviewGraphDeps,
  context: readonly string[] = [],
) {
  let done: Extract<ReviewStreamEvent, { type: "done" }> | undefined;
  for await (const event of streamReview(sql, deps, context)) {
    if (event.type === "done") {
      done = event;
    }
  }
  if (done === undefined) {
    throw new Error("review stream ended without a result");
  }
  return done;
}

export function citationsFor(hazards: Hazard[], chunks: RunbookChunk[], draft: string): Citation[] {
  const citations: Citation[] = [];
  for (const hazard of hazards) {
    const quote = hazard.reason.trim();
    if (quote.length > 0 && draft.includes(quote)) {
      citations.push({
        kind: "parser",
        quote,
        sourceId: `statement:${hazard.statementIndex}`,
      });
    }
  }
  for (const chunk of chunks) {
    const quote = firstSentence(chunk.text).replace(/[.!?]$/, "");
    if (quote.length > 0 && draft.includes(quote)) {
      citations.push({
        kind: chunk.id.startsWith("context-") ? "context" : "runbook",
        quote,
        sourceId: chunk.id,
      });
    }
  }
  return citations;
}

function normalizeContext(context: readonly string[]): string[] {
  return context.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

function withPeriod(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function firstSentence(text: string): string {
  const match = text.match(/^.*?[.!?](?:\s|$)/);
  return (match?.[0] ?? text).trim();
}

function messageText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (typeof part === "object" && part !== null && "text" in part) {
          return String(part.text);
        }
        return "";
      })
      .join("");
  }
  return "";
}

function createQueue<T>() {
  const items: T[] = [];
  let waiting: {
    resolve: (result: IteratorResult<T>) => void;
    reject: (error: unknown) => void;
  } | undefined;
  let closed = false;
  let failure: unknown;

  return {
    push(value: T) {
      if (closed) {
        return;
      }
      if (waiting) {
        const current = waiting;
        waiting = undefined;
        current.resolve({ value, done: false });
        return;
      }
      items.push(value);
    },
    close() {
      closed = true;
      waiting?.resolve({ value: undefined as T, done: true });
      waiting = undefined;
    },
    fail(error: unknown) {
      failure = error;
      closed = true;
      waiting?.reject(error);
      waiting = undefined;
    },
    next(): Promise<IteratorResult<T>> {
      const value = items.shift();
      if (value !== undefined) {
        return Promise.resolve({ value, done: false });
      }
      if (failure !== undefined) {
        return Promise.reject(failure);
      }
      if (closed) {
        return Promise.resolve({ value: undefined as T, done: true });
      }
      return new Promise((resolve, reject) => {
        waiting = { resolve, reject };
      });
    },
  };
}
