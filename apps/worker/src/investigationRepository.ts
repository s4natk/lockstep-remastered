import {
  isInvestigationReport,
  type FailureKind,
  type InvestigationReport,
  type InvestigationStatus,
  type InvestigationSession,
} from "@lockstep/shared";

export interface InvestigationHistoryItem extends Pick<
  InvestigationSession,
  "id" | "kind" | "summary" | "status" | "createdAt"
> {
  mode: "ai" | "deterministic" | null;
}
interface InvestigationRow {
  id: string;
  kind: FailureKind;
  summary: string;
  status: InvestigationStatus;
  created_at: string;
  mode: "ai" | "deterministic" | null;
  report_json: string | null;
}
const HISTORY_LIMIT = 100;
const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS investigations (id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, kind TEXT NOT NULL, summary TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, mode TEXT, report_json TEXT)",
  "CREATE INDEX IF NOT EXISTS investigations_owner_created ON investigations(owner_hash, created_at DESC)",
  "CREATE TABLE IF NOT EXISTS investigation_limits (bucket TEXT NOT NULL, owner_hash TEXT NOT NULL, requests INTEGER NOT NULL, PRIMARY KEY(bucket, owner_hash))",
];

export class InvestigationRepository {
  private readonly db: D1Database;
  constructor(db: D1Database) {
    this.db = db;
  }
  async ensureSchema(): Promise<void> {
    for (const sql of SCHEMA) await this.db.prepare(sql).run();
  }
  async admit(ownerHash: string, now = new Date()): Promise<boolean> {
    await this.ensureSchema();
    const bucket = now.toISOString().slice(0, 16);
    for (const [owner, limit] of [
      [ownerHash, 10],
      ["global", 60],
    ] as const) {
      const row = await this.db
        .prepare(
          "INSERT INTO investigation_limits(bucket, owner_hash, requests) VALUES (?, ?, 1) ON CONFLICT(bucket, owner_hash) DO UPDATE SET requests = requests + 1 WHERE requests < ? RETURNING requests",
        )
        .bind(bucket, owner, limit)
        .first();
      if (!row) return false;
    }
    await this.db
      .prepare("DELETE FROM investigation_limits WHERE bucket < ?")
      .bind(new Date(now.getTime() - 3_600_000).toISOString().slice(0, 16))
      .run();
    return true;
  }
  async begin(ownerHash: string, id: string, kind: FailureKind, createdAt: string): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO investigations(id, owner_hash, kind, summary, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'running', ?, ?)",
      )
      .bind(id, ownerHash, kind, "Investigation in progress", createdAt, createdAt)
      .run();
    await this.db
      .prepare(
        "DELETE FROM investigations WHERE owner_hash = ? AND id NOT IN (SELECT id FROM investigations WHERE owner_hash = ? ORDER BY created_at DESC LIMIT ?)",
      )
      .bind(ownerHash, ownerHash, HISTORY_LIMIT)
      .run();
  }
  async save(ownerHash: string, report: InvestigationReport): Promise<void> {
    const json = JSON.stringify(report);
    if (new TextEncoder().encode(json).byteLength > 262_144)
      throw new Error("Report exceeds persistence limit");
    await this.db
      .prepare(
        "UPDATE investigations SET kind = ?, summary = ?, status = 'complete', updated_at = ?, mode = ?, report_json = ? WHERE id = ? AND owner_hash = ?",
      )
      .bind(
        report.kind,
        report.summary,
        new Date().toISOString(),
        report.mode,
        json,
        report.sessionId,
        ownerHash,
      )
      .run();
  }
  async finish(ownerHash: string, id: string, status: "cancelled" | "failed"): Promise<void> {
    await this.db
      .prepare(
        "UPDATE investigations SET status = ?, summary = ?, updated_at = ? WHERE id = ? AND owner_hash = ? AND status = 'running'",
      )
      .bind(
        status,
        status === "cancelled"
          ? "Investigation interrupted or cancelled"
          : "Investigation could not finish",
        new Date().toISOString(),
        id,
        ownerHash,
      )
      .run();
  }
  async list(ownerHash: string): Promise<InvestigationHistoryItem[]> {
    await this.ensureSchema();
    const rows = await this.db
      .prepare(
        "SELECT id, kind, summary, status, created_at, mode FROM investigations WHERE owner_hash = ? ORDER BY created_at DESC LIMIT ?",
      )
      .bind(ownerHash, HISTORY_LIMIT)
      .all<InvestigationRow>();
    return rows.results.map((row) => ({
      id: row.id,
      kind: row.kind,
      summary: row.summary,
      status: row.status,
      createdAt: row.created_at,
      mode: row.mode,
    }));
  }
  async find(
    ownerHash: string,
    id: string,
  ): Promise<{ status: InvestigationStatus; report: InvestigationReport | null } | null> {
    await this.ensureSchema();
    const row = await this.db
      .prepare("SELECT status, report_json FROM investigations WHERE id = ? AND owner_hash = ?")
      .bind(id, ownerHash)
      .first<InvestigationRow>();
    if (!row) return null;
    let report: unknown;
    try {
      report = row.report_json ? JSON.parse(row.report_json) : null;
    } catch {
      report = null;
    }
    return { status: row.status, report: isInvestigationReport(report) ? report : null };
  }
  async remove(ownerHash: string, id: string): Promise<void> {
    await this.ensureSchema();
    await this.db
      .prepare("DELETE FROM investigations WHERE id = ? AND owner_hash = ?")
      .bind(id, ownerHash)
      .run();
  }
}

export async function investigationOwner(authorization: string | null): Promise<string | null> {
  const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(authorization ?? "");
  if (!match?.[1]) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(match[1]));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
