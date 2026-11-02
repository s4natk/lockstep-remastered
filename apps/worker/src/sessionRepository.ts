import type { Env } from "./env.js";

export interface NewSession {
  id: string;
  sql: string;
  parseJson: string;
  createdAt?: string;
}

export interface SessionRecord {
  id: string;
  createdAt: string;
  sql: string;
  note: string | null;
  parseJson: string | null;
  citationsJson: string | null;
  traceJson: string | null;
}

export interface SessionReviewUpdate {
  note: string;
  citationsJson: string;
  traceJson: string | null;
}

interface SessionRow {
  id: string;
  created_at: string;
  sql: string;
  note: string | null;
  parse_json: string | null;
  citations_json: string | null;
  trace_json: string | null;
}

const COLUMNS =
  "id, created_at, sql, note, parse_json, citations_json, trace_json";

export class SessionRepository {
  constructor(private readonly db: Env["DB"]) {}

  async insert(session: NewSession): Promise<void> {
    await this.ensureSchema();
    const createdAt = session.createdAt ?? new Date().toISOString();
    await this.db
      .prepare(
        `INSERT OR REPLACE INTO sessions (${COLUMNS}) VALUES (?, ?, ?, NULL, ?, NULL, NULL)`,
      )
      .bind(session.id, createdAt, session.sql, session.parseJson)
      .run();
  }

  async ensureSchema(): Promise<void> {
    await this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          sql TEXT NOT NULL,
          note TEXT,
          parse_json TEXT,
          citations_json TEXT,
          trace_json TEXT
        )`,
      )
      .run();
  }

  async findById(id: string): Promise<SessionRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${COLUMNS} FROM sessions WHERE id = ?`)
      .bind(id)
      .first<SessionRow>();
    return row === null ? null : toRecord(row);
  }

  async saveReview(id: string, update: SessionReviewUpdate): Promise<void> {
    await this.db
      .prepare(
        `UPDATE sessions
         SET note = ?, citations_json = ?, trace_json = ?
         WHERE id = ?`,
      )
      .bind(update.note, update.citationsJson, update.traceJson, id)
      .run();
  }
}

function toRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    sql: row.sql,
    note: row.note,
    parseJson: row.parse_json,
    citationsJson: row.citations_json,
    traceJson: row.trace_json,
  };
}
