import { streamAssistantReply } from "./assistantChat.js";
import { createEmbedder } from "./embeddings.js";
import type { Env } from "./env.js";
import { hybridSearch } from "./hybridSearch.js";
import { looksLikeMigration } from "./migrationDetect.js";
import { parseMigration, MigrationParseError } from "./parser.js";
import { createReviewModel, streamReview } from "./reviewGraph.js";
import { runbookChunks } from "./runbookChunks.js";
import { readSessionMessage } from "./sessionMessage.js";
import { SessionRepository } from "./sessionRepository.js";

export class ReviewSession implements DurableObject {
  private readonly sessions: SessionRepository;

  constructor(
    _state: DurableObjectState,
    private readonly env: Env,
  ) {
    this.sessions = new SessionRepository(env.DB);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    const sessionId = sessionIdFrom(request);
    server.addEventListener("message", (event) => {
      void this.onMessage(server, sessionId, String(event.data));
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  private async onMessage(server: WebSocket, sessionId: string, raw: string): Promise<void> {
    const request = readSessionMessage(raw);
    if ("error" in request) {
      send(server, { type: "error", error: request.error });
      return;
    }
    const { kind, text, context } = request;

    if (kind === "review") {
      try {
        await this.runReview(server, sessionId, text, context);
      } catch (error) {
        const message = error instanceof MigrationParseError ? error.message : "The review failed.";
        send(server, { type: "error", error: message });
      }
      return;
    }

    if (!looksLikeMigration(text)) {
      await this.runChat(server, sessionId, text);
      return;
    }

    try {
      await this.runReview(server, sessionId, text, context);
    } catch (error) {
      if (error instanceof MigrationParseError) {
        await this.runChat(server, sessionId, text);
        return;
      }
      send(server, { type: "error", error: "The review failed." });
    }
  }

  private async runChat(server: WebSocket, sessionId: string, text: string): Promise<void> {
    send(server, { type: "intent", intent: "chat", sessionId });
    let reply = "";
    try {
      for await (const token of streamAssistantReply(text, this.env.OPENAI_API_KEY)) {
        reply += token;
        send(server, { type: "token", content: token });
      }
      send(server, { type: "done", sessionId, intent: "chat", reply });
    } catch {
      send(server, { type: "error", error: "The assistant could not respond. Check OPENAI_API_KEY." });
    }
  }

  private async runReview(
    server: WebSocket,
    sessionId: string,
    sql: string,
    context: string[],
  ): Promise<void> {
    send(server, { type: "intent", intent: "review", sessionId });
    const parsed = await parseMigration(sql);
    send(server, { type: "parse", sessionId, result: parsed });
    await this.sessions.insert({
      id: sessionId,
      sql,
      parseJson: JSON.stringify(parsed),
    });
    for await (const event of streamReview(sql, {
      parse: async () => parsed,
      search: (query) =>
        hybridSearch({
          chunks: runbookChunks,
          query,
          embedder: createEmbedder(this.env.OPENAI_API_KEY),
          vectorize: this.env.VECTORIZE,
          limit: 3,
        }),
      model: createReviewModel(this.env.OPENAI_API_KEY),
    }, context)) {
      if (event.type === "token") {
        send(server, { type: "token", content: event.content });
        continue;
      }
      if (event.type === "stage") {
        send(server, { type: "stage", stage: event.stage });
        continue;
      }
      await this.sessions.saveReview(sessionId, {
        note: event.note,
        citationsJson: JSON.stringify(event.citations),
        traceJson: JSON.stringify(event.trace),
      });
      send(server, { ...event, sessionId, intent: "review" });
    }
  }
}

function sessionIdFrom(request: Request): string {
  const segment = new URL(request.url).pathname.split("/").filter(Boolean).pop();
  return segment && segment !== "connect" ? segment : crypto.randomUUID();
}

function send(server: WebSocket, message: unknown): void {
  server.send(JSON.stringify(message));
}
