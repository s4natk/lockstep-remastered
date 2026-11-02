import {
  isInvestigationReport,
  isSidekickMessage,
  validateSidekickTurnInput,
  SIDEKICK_LIMITS,
  type FailureKind,
  type InvestigationReport,
  type SidekickMessage,
  type SidekickThread,
  type SidekickTurnInput,
  type ThreadSummary,
} from "@lockstep/shared";
import { InvestigationRepository } from "./investigationRepository.js";
import { KnowledgeRepository } from "./knowledgeRepository.js";

const MAX_THREADS = 100;
const MAX_MESSAGES = 100;
const MAX_THREAD_BYTES = 4_194_304;
const TURN_RESERVE_BYTES = 500_000;
const LEASE_MS = 120_000;
const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS sidekick_turn_inputs (thread_id TEXT NOT NULL, owner_hash TEXT NOT NULL, client_turn_id TEXT NOT NULL, request_json TEXT NOT NULL, PRIMARY KEY(thread_id, owner_hash, client_turn_id))",
  "CREATE TABLE IF NOT EXISTS sidekick_threads (id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'unknown', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'idle', last_preview TEXT NOT NULL DEFAULT '', context_ids_json TEXT NOT NULL DEFAULT '[]', active_turn_id TEXT, lease_expires_at TEXT)",
  "CREATE INDEX IF NOT EXISTS sidekick_threads_owner_updated ON sidekick_threads(owner_hash, updated_at DESC)",
  "CREATE TABLE IF NOT EXISTS sidekick_messages (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, owner_hash TEXT NOT NULL, client_turn_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, report_json TEXT, mode TEXT, context_ids_json TEXT NOT NULL DEFAULT '[]', UNIQUE(thread_id, owner_hash, client_turn_id, role))",
  "CREATE INDEX IF NOT EXISTS sidekick_messages_thread_created ON sidekick_messages(thread_id, owner_hash, created_at)",
];
interface ThreadRow {
  id: string;
  owner_hash: string;
  title: string;
  kind: FailureKind;
  created_at: string;
  updated_at: string;
  status: "idle" | "running";
  last_preview: string;
  context_ids_json: string;
  active_turn_id: string | null;
  lease_expires_at: string | null;
}
interface MessageRow {
  id: string;
  thread_id: string;
  client_turn_id: string;
  role: "user" | "assistant";
  content: string;
  status: SidekickMessage["status"] | "pending";
  created_at: string;
  report_json: string | null;
  mode: "ai" | "deterministic" | null;
  context_ids_json: string;
}
export class ThreadStoreError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "ThreadStoreError";
    this.code = code;
  }
}
export class ThreadRepository {
  private readonly db: D1Database;
  constructor(db: D1Database) {
    this.db = db;
  }
  async ensureSchema(): Promise<void> {
    for (const sql of SCHEMA) await this.db.prepare(sql).run();
  }
  async create(owner: string, title = "New investigation"): Promise<SidekickThread> {
    await this.ensureSchema();
    const count = await this.db
      .prepare("SELECT COUNT(*) AS count FROM sidekick_threads WHERE owner_hash = ?")
      .bind(owner)
      .first<{ count: number }>();
    if ((count?.count ?? 0) >= MAX_THREADS)
      throw new ThreadStoreError(
        "Your history has reached 100 investigations. Export or delete an older thread before starting another.",
        "history_limit",
      );
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const created = await this.db
      .prepare(
        "INSERT INTO sidekick_threads(id, owner_hash, title, kind, created_at, updated_at) SELECT ?, ?, ?, 'unknown', ?, ? WHERE (SELECT COUNT(*) FROM sidekick_threads WHERE owner_hash = ?) < 100",
      )
      .bind(id, owner, title, now, now, owner)
      .run();
    if (!created.meta.changes)
      throw new ThreadStoreError(
        "Your history has reached 100 investigations. Delete an older thread before starting another.",
        "history_limit",
      );
    return {
      id,
      title,
      kind: "unknown",
      createdAt: now,
      updatedAt: now,
      status: "idle",
      lastPreview: "",
      messages: [],
      contextIds: [],
    };
  }
  async list(owner: string): Promise<ThreadSummary[]> {
    await this.ensureSchema();
    await this.recoverExpired(owner);
    const rows = await this.db
      .prepare(
        "SELECT * FROM sidekick_threads WHERE owner_hash = ? ORDER BY updated_at DESC, id DESC LIMIT ?",
      )
      .bind(owner, MAX_THREADS)
      .all<ThreadRow>();
    return rows.results.map(summary);
  }
  async find(owner: string, id: string): Promise<SidekickThread | null> {
    await this.ensureSchema();
    await this.recoverExpired(owner);
    const row = await this.db
      .prepare("SELECT * FROM sidekick_threads WHERE id = ? AND owner_hash = ?")
      .bind(id, owner)
      .first<ThreadRow>();
    if (!row) return null;
    let contextIds = decodeIds(row.context_ids_json);
    if (contextIds.length) {
      const available = new Set(
        (await new KnowledgeRepository(this.db).list(owner)).map((document) => document.id),
      );
      const liveIds = contextIds.filter((contextId) => available.has(contextId));
      if (liveIds.length !== contextIds.length) {
        // Repair only the selection read above; a concurrent pin update wins.
        await this.db
          .prepare(
            "UPDATE sidekick_threads SET context_ids_json = ? WHERE id = ? AND owner_hash = ? AND context_ids_json = ?",
          )
          .bind(JSON.stringify(liveIds), id, owner, row.context_ids_json)
          .run();
        contextIds = liveIds;
      }
    }
    const messages = await this.db
      .prepare(
        "SELECT * FROM sidekick_messages WHERE thread_id = ? AND owner_hash = ? AND status != 'pending' ORDER BY created_at ASC, rowid ASC LIMIT ?",
      )
      .bind(id, owner, MAX_MESSAGES)
      .all<MessageRow>();
    return {
      ...summary(row),
      contextIds,
      messages: messages.results.flatMap((value) => {
        const message = toMessage(value);
        return message ? [message] : [];
      }),
    };
  }
  async turn(
    owner: string,
    threadId: string,
    clientTurnId: string,
  ): Promise<{
    user: SidekickMessage | null;
    assistant: SidekickMessage | null;
    pending: boolean;
  } | null> {
    const rows = await this.db
      .prepare(
        "SELECT * FROM sidekick_messages WHERE thread_id = ? AND owner_hash = ? AND client_turn_id = ? ORDER BY role",
      )
      .bind(threadId, owner, clientTurnId)
      .all<MessageRow>();
    if (!rows.results.length) return null;
    const user = rows.results.find((row) => row.role === "user");
    const assistant = rows.results.find((row) => row.role === "assistant");
    return {
      user: user ? toMessage(user) : null,
      assistant: assistant ? toMessage(assistant) : null,
      pending: assistant?.status === "pending",
    };
  }
  async beginTurn(
    owner: string,
    thread: SidekickThread,
    input: SidekickTurnInput,
    contextIds: string[],
  ): Promise<{ user: SidekickMessage; assistantId: string }> {
    const counts = await this.db
      .prepare(
        "SELECT COUNT(*) AS count, COALESCE(SUM(length(CAST(content AS BLOB)) + length(CAST(COALESCE(report_json, '') AS BLOB))), 0) AS bytes FROM sidekick_messages WHERE thread_id = ? AND owner_hash = ?",
      )
      .bind(thread.id, owner)
      .first<{ count: number; bytes: number }>();
    const inputs = await this.db
      .prepare(
        "SELECT COALESCE(SUM(length(CAST(request_json AS BLOB))), 0) AS bytes FROM sidekick_turn_inputs WHERE thread_id = ? AND owner_hash = ?",
      )
      .bind(thread.id, owner)
      .first<{ bytes: number }>();
    if (
      (counts?.count ?? 0) + 2 > Math.min(MAX_MESSAGES, SIDEKICK_LIMITS.messages) ||
      (counts?.bytes ?? 0) + (inputs?.bytes ?? 0) + TURN_RESERVE_BYTES > MAX_THREAD_BYTES
    )
      throw new ThreadStoreError(
        "This investigation has reached its conversation limit. Start a new thread with the relevant evidence to continue.",
        "conversation_limit",
      );
    const now = new Date().toISOString();
    const expiry = new Date(Date.now() + LEASE_MS).toISOString();
    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    const title = thread.messages.length
      ? thread.title
      : input.message
          .split(/\r?\n/)
          .find((line) => line.trim())
          ?.trim()
          .slice(0, 100) || "New investigation";
    const contextJson = JSON.stringify(contextIds);
    const result = await this.db.batch([
      this.db
        .prepare(
          "UPDATE sidekick_threads SET status = 'running', active_turn_id = ?, lease_expires_at = ?, updated_at = ?, context_ids_json = ?, title = ? WHERE id = ? AND owner_hash = ? AND status = 'idle' AND NOT EXISTS (SELECT 1 FROM sidekick_messages WHERE thread_id = ? AND owner_hash = ? AND client_turn_id = ?)",
        )
        .bind(
          input.clientTurnId,
          expiry,
          now,
          contextJson,
          title,
          thread.id,
          owner,
          thread.id,
          owner,
          input.clientTurnId,
        ),
      this.db
        .prepare(
          "INSERT OR IGNORE INTO sidekick_messages(id, thread_id, owner_hash, client_turn_id, role, content, status, created_at, context_ids_json) SELECT ?, id, owner_hash, ?, 'user', ?, 'complete', ?, ? FROM sidekick_threads WHERE id = ? AND owner_hash = ? AND active_turn_id = ? AND status = 'running'",
        )
        .bind(
          userId,
          input.clientTurnId,
          input.message,
          now,
          contextJson,
          thread.id,
          owner,
          input.clientTurnId,
        ),
      this.db
        .prepare(
          "INSERT OR IGNORE INTO sidekick_messages(id, thread_id, owner_hash, client_turn_id, role, content, status, created_at, context_ids_json) SELECT ?, id, owner_hash, ?, 'assistant', '', 'pending', ?, ? FROM sidekick_threads WHERE id = ? AND owner_hash = ? AND active_turn_id = ? AND status = 'running'",
        )
        .bind(
          assistantId,
          input.clientTurnId,
          now,
          contextJson,
          thread.id,
          owner,
          input.clientTurnId,
        ),
      this.db
        .prepare(
          "INSERT OR IGNORE INTO sidekick_turn_inputs(thread_id, owner_hash, client_turn_id, request_json) SELECT id, owner_hash, ?, ? FROM sidekick_threads WHERE id = ? AND owner_hash = ? AND active_turn_id = ? AND status = 'running'",
        )
        .bind(
          input.clientTurnId,
          JSON.stringify({ ...input, contextIds }),
          thread.id,
          owner,
          input.clientTurnId,
        ),
    ]);
    if (!result[0]?.meta.changes)
      throw new ThreadStoreError(
        "An investigation is already running in this thread. Wait for it or stop it before sending another message.",
        "thread_busy",
      );
    return {
      user: {
        id: userId,
        threadId: thread.id,
        role: "user",
        content: input.message,
        createdAt: now,
        status: "complete",
        clientTurnId: input.clientTurnId,
        contextIds,
      },
      assistantId,
    };
  }
  async input(owner: string, threadId: string, turnId: string): Promise<SidekickTurnInput | null> {
    const row = await this.db
      .prepare(
        "SELECT request_json FROM sidekick_turn_inputs WHERE thread_id = ? AND owner_hash = ? AND client_turn_id = ?",
      )
      .bind(threadId, owner, turnId)
      .first<{ request_json: string }>();
    if (!row) return null;
    try {
      return validateSidekickTurnInput(JSON.parse(row.request_json));
    } catch {
      return null;
    }
  }
  async isActive(owner: string, id: string, turnId: string): Promise<boolean> {
    const row = await this.db
      .prepare(
        "SELECT id FROM sidekick_threads WHERE id = ? AND owner_hash = ? AND status = 'running' AND active_turn_id = ?",
      )
      .bind(id, owner, turnId)
      .first();
    return row !== null;
  }
  async complete(
    owner: string,
    threadId: string,
    turnId: string,
    assistantId: string,
    report: InvestigationReport,
    content: string,
  ): Promise<SidekickMessage> {
    const now = new Date().toISOString();
    const json = JSON.stringify(report);
    if (
      new TextEncoder().encode(json).byteLength > 262_144 ||
      content.length > SIDEKICK_LIMITS.message
    )
      throw new ThreadStoreError(
        "The response exceeded its safe storage limit. Try a smaller excerpt.",
        "response_limit",
      );
    const result = await this.db.batch([
      this.db
        .prepare(
          "UPDATE sidekick_messages SET content = ?, report_json = ?, mode = ?, status = 'complete', created_at = ? WHERE id = ? AND thread_id = ? AND owner_hash = ? AND status = 'pending' AND EXISTS(SELECT 1 FROM sidekick_threads WHERE id = ? AND owner_hash = ? AND active_turn_id = ? AND status = 'running')",
        )
        .bind(
          content,
          json,
          report.mode,
          now,
          assistantId,
          threadId,
          owner,
          threadId,
          owner,
          turnId,
        ),
      this.db
        .prepare(
          "UPDATE sidekick_threads SET status = 'idle', active_turn_id = NULL, lease_expires_at = NULL, updated_at = ?, last_preview = ?, kind = ? WHERE id = ? AND owner_hash = ? AND active_turn_id = ? AND status = 'running'",
        )
        .bind(now, report.summary.slice(0, 2000), report.kind, threadId, owner, turnId),
    ]);
    if (!result[0]?.meta.changes)
      throw new ThreadStoreError(
        "This turn was stopped before it could finish. Its partial answer was not saved as a completed result.",
        "turn_cancelled",
      );
    const row = await this.db
      .prepare("SELECT * FROM sidekick_messages WHERE id = ? AND owner_hash = ?")
      .bind(assistantId, owner)
      .first<MessageRow>();
    const message = row ? toMessage(row) : null;
    if (!message) throw new Error("Saved sidekick message is invalid");
    return message;
  }
  async finish(
    owner: string,
    id: string,
    turnId: string,
    status: "failed" | "cancelled",
  ): Promise<void> {
    const now = new Date().toISOString();
    const content =
      status === "cancelled"
        ? "This turn was cancelled. Your message and context are saved; send a new message when you are ready to continue."
        : "This turn could not finish. Your conversation and context are saved; you can retry with a new message.";
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE sidekick_messages SET status = ?, content = ?, created_at = ? WHERE thread_id = ? AND owner_hash = ? AND client_turn_id = ? AND role = 'assistant' AND status = 'pending'",
        )
        .bind(status, content, now, id, owner, turnId),
      this.db
        .prepare(
          "UPDATE sidekick_threads SET status = 'idle', active_turn_id = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ? AND owner_hash = ? AND active_turn_id = ?",
        )
        .bind(now, id, owner, turnId),
    ]);
  }
  async cancel(owner: string, id: string, expectedTurnId?: string): Promise<boolean> {
    await this.ensureSchema();
    const row = await this.db
      .prepare("SELECT active_turn_id FROM sidekick_threads WHERE id = ? AND owner_hash = ?")
      .bind(id, owner)
      .first<{ active_turn_id: string | null }>();
    if (!row) return false;
    if (expectedTurnId && row.active_turn_id && row.active_turn_id !== expectedTurnId)
      throw new ThreadStoreError(
        "Another turn has started in this thread. Refresh before stopping it.",
        "turn_changed",
      );
    if (row.active_turn_id) await this.finish(owner, id, row.active_turn_id, "cancelled");
    return true;
  }
  async setContext(owner: string, id: string, ids: string[]): Promise<boolean> {
    const result = await this.db
      .prepare(
        "UPDATE sidekick_threads SET context_ids_json = ?, updated_at = ? WHERE id = ? AND owner_hash = ? AND status = 'idle'",
      )
      .bind(JSON.stringify(ids), new Date().toISOString(), id, owner)
      .run();
    return Boolean(result.meta.changes);
  }
  async remove(owner: string, id: string): Promise<boolean> {
    await this.ensureSchema();
    const exists = await this.db
      .prepare("SELECT id FROM sidekick_threads WHERE id = ? AND owner_hash = ?")
      .bind(id, owner)
      .first();
    if (!exists) return false;
    await this.db.batch([
      this.db
        .prepare("DELETE FROM sidekick_turn_inputs WHERE thread_id = ? AND owner_hash = ?")
        .bind(id, owner),
      this.db
        .prepare("DELETE FROM sidekick_messages WHERE thread_id = ? AND owner_hash = ?")
        .bind(id, owner),
      this.db
        .prepare("DELETE FROM sidekick_threads WHERE id = ? AND owner_hash = ?")
        .bind(id, owner),
      ...(id.startsWith("legacy-")
        ? [
            this.db
              .prepare("DELETE FROM investigations WHERE id = ? AND owner_hash = ?")
              .bind(id.slice(7), owner),
          ]
        : []),
    ]);
    return true;
  }
  async importLegacy(owner: string): Promise<void> {
    await this.ensureSchema();
    const legacy = new InvestigationRepository(this.db);
    const records = await legacy.list(owner);
    for (const entry of records.filter((item) => item.status === "complete")) {
      const id = `legacy-${entry.id}`;
      if (
        await this.db
          .prepare("SELECT id FROM sidekick_threads WHERE id = ? AND owner_hash = ?")
          .bind(id, owner)
          .first()
      )
        continue;
      const found = await legacy.find(owner, entry.id);
      if (!found?.report) continue;
      const report = found.report;
      const source =
        report.evidence.find((item) => item.id === "input:document")?.content ??
        report.evidence
          .filter((item) => item.kind === "input")
          .map((item) => item.content)
          .join("\n");
      const answer = report.assistantAnswer ?? reportToMarkdown(report);
      await this.db.batch([
        this.db
          .prepare(
            "INSERT OR IGNORE INTO sidekick_threads(id, owner_hash, title, kind, created_at, updated_at, last_preview) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(
            id,
            owner,
            entry.summary.slice(0, 100),
            report.kind,
            entry.createdAt,
            entry.createdAt,
            entry.summary.slice(0, 2000),
          ),
        this.db
          .prepare(
            "INSERT OR IGNORE INTO sidekick_messages(id, thread_id, owner_hash, client_turn_id, role, content, status, created_at) VALUES (?, ?, ?, ?, 'user', ?, 'complete', ?)",
          )
          .bind(
            `${id}-user`,
            id,
            owner,
            `import-${entry.id}`,
            source.slice(0, SIDEKICK_LIMITS.message) || "Imported investigation evidence",
            entry.createdAt,
          ),
        this.db
          .prepare(
            "INSERT OR IGNORE INTO sidekick_messages(id, thread_id, owner_hash, client_turn_id, role, content, status, created_at, report_json, mode) VALUES (?, ?, ?, ?, 'assistant', ?, 'complete', ?, ?, ?)",
          )
          .bind(
            `${id}-assistant`,
            id,
            owner,
            `import-${entry.id}`,
            answer.slice(0, SIDEKICK_LIMITS.message),
            entry.createdAt,
            JSON.stringify(report),
            report.mode,
          ),
      ]);
    }
  }
  private async recoverExpired(owner: string): Promise<void> {
    const expired = await this.db
      .prepare(
        "SELECT id, active_turn_id FROM sidekick_threads WHERE owner_hash = ? AND status = 'running' AND lease_expires_at < ?",
      )
      .bind(owner, new Date().toISOString())
      .all<{ id: string; active_turn_id: string }>();
    for (const row of expired.results)
      await this.finish(owner, row.id, row.active_turn_id, "failed");
  }
}
function summary(row: ThreadRow): ThreadSummary {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    lastPreview: row.last_preview,
  };
}
function decodeIds(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value)
      ? value
          .filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id))
          .slice(0, SIDEKICK_LIMITS.contextIds)
      : [];
  } catch {
    return [];
  }
}
function toMessage(row: MessageRow): SidekickMessage | null {
  if (row.status === "pending") return null;
  let report: unknown;
  try {
    report = row.report_json ? JSON.parse(row.report_json) : undefined;
  } catch {
    report = undefined;
  }
  const message: SidekickMessage = {
    id: row.id,
    threadId: row.thread_id,
    clientTurnId: row.client_turn_id,
    role: row.role,
    content: row.content,
    status: row.status,
    createdAt: row.created_at,
    ...(row.mode ? { mode: row.mode } : {}),
    ...(isInvestigationReport(report) ? { report } : {}),
    contextIds: decodeIds(row.context_ids_json),
  };
  return isSidekickMessage(message) ? message : null;
}
export function reportToMarkdown(report: InvestigationReport): string {
  const lines = [report.summary];
  if (report.primaryHypothesis)
    lines.push(`\n### Working hypothesis\n${report.primaryHypothesis.explanation}`);
  if (report.remediation.length)
    lines.push(
      `\n### Next steps\n${report.remediation.map((step, index) => `${index + 1}. **${step.title}** — ${step.detail}`).join("\n")}`,
    );
  if (report.verification.length)
    lines.push(
      `\n### Verify the change\n${report.verification.map((step) => `- ${step.detail}`).join("\n")}`,
    );
  if (report.missingInformation.length)
    lines.push(
      `\n### Helpful context\n${report.missingInformation.map((item) => `- ${item}`).join("\n")}`,
    );
  return lines.join("\n").slice(0, 20_000);
}
