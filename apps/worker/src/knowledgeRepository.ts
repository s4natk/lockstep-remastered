import {
  KNOWLEDGE_LIMITS,
  type KnowledgeDocument,
  type KnowledgeInput,
  type KnowledgeKind,
  type KnowledgeSummary,
} from "@lockstep/shared";

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  title: string;
  ordinal: number;
  content: string;
  lineStart: number;
  lineEnd: number;
}
interface DocumentRow {
  id: string;
  title: string;
  kind: KnowledgeKind;
  content: string;
  created_at: string;
  updated_at: string;
  char_count: number;
  chunk_count: number;
  index_status: "keyword" | "semantic";
}
interface ChunkRow {
  id: string;
  document_id: string;
  title: string;
  ordinal: number;
  content: string;
  line_start: number;
  line_end: number;
}
const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS knowledge_documents (id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, char_count INTEGER NOT NULL, chunk_count INTEGER NOT NULL, index_status TEXT NOT NULL DEFAULT 'keyword')",
  "CREATE INDEX IF NOT EXISTS knowledge_owner_updated ON knowledge_documents(owner_hash, updated_at DESC)",
  "CREATE TABLE IF NOT EXISTS knowledge_chunks (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, owner_hash TEXT NOT NULL, ordinal INTEGER NOT NULL, content TEXT NOT NULL, line_start INTEGER NOT NULL, line_end INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS knowledge_chunks_owner_document ON knowledge_chunks(owner_hash, document_id, ordinal)",
];
export class KnowledgeCapacityError extends Error {
  constructor() {
    super(
      "Delete a context document before adding another. Each browser can save up to 50 documents.",
    );
    this.name = "KnowledgeCapacityError";
  }
}

export function chunkKnowledge(
  content: string,
): Array<Omit<KnowledgeChunk, "id" | "documentId" | "title">> {
  const chunks: Array<Omit<KnowledgeChunk, "id" | "documentId" | "title">> = [];
  let start = 0;
  let line = 1;
  while (start < content.length) {
    let end = Math.min(start + 1_800, content.length);
    if (end < content.length) {
      const boundary = content.lastIndexOf("\n", end - 1);
      if (boundary >= start + 900) end = boundary + 1;
      const code = content.charCodeAt(end - 1);
      if (code >= 0xd800 && code <= 0xdbff) end -= 1;
      if (content[end - 1] === "\r" && content[end] === "\n") end -= 1;
    }
    const text = content.slice(start, end);
    const breaks = text.match(/\r\n|\n|\r/g)?.length ?? 0;
    chunks.push({
      ordinal: chunks.length,
      content: text,
      lineStart: line,
      lineEnd: line + breaks - (/[\r\n]$/.test(text) ? 1 : 0),
    });
    line += breaks;
    start = end;
  }
  if (chunks.length > KNOWLEDGE_LIMITS.chunks) throw new Error("Context exceeds the chunk limit");
  return chunks;
}
function summary(row: DocumentRow): KnowledgeSummary {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    charCount: row.char_count,
    chunkCount: row.chunk_count,
    indexStatus: row.index_status,
  };
}
export class KnowledgeRepository {
  private readonly db: D1Database;
  constructor(db: D1Database) {
    this.db = db;
  }
  async ensureSchema(): Promise<void> {
    for (const sql of SCHEMA) await this.db.prepare(sql).run();
  }
  async create(owner: string, input: KnowledgeInput): Promise<KnowledgeDocument> {
    await this.ensureSchema();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const chunks = chunkKnowledge(input.content);
    const insert = this.db
      .prepare(
        "INSERT INTO knowledge_documents(id, owner_hash, title, kind, content, created_at, updated_at, char_count, chunk_count, index_status) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'keyword' WHERE (SELECT COUNT(*) FROM knowledge_documents WHERE owner_hash = ?) < ?",
      )
      .bind(
        id,
        owner,
        input.title,
        input.kind,
        input.content,
        now,
        now,
        input.content.length,
        chunks.length,
        owner,
        KNOWLEDGE_LIMITS.documents,
      );
    const statements = chunks.map((chunk) =>
      this.db
        .prepare(
          "INSERT INTO knowledge_chunks(id, document_id, owner_hash, ordinal, content, line_start, line_end) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM knowledge_documents WHERE id = ? AND owner_hash = ?)",
        )
        .bind(
          `kb:${id}:${chunk.ordinal}`,
          id,
          owner,
          chunk.ordinal,
          chunk.content,
          chunk.lineStart,
          chunk.lineEnd,
          id,
          owner,
        ),
    );
    const results = await this.db.batch([insert, ...statements]);
    if (!results[0]?.meta.changes) throw new KnowledgeCapacityError();
    return {
      id,
      title: input.title,
      kind: input.kind,
      content: input.content,
      createdAt: now,
      updatedAt: now,
      charCount: input.content.length,
      chunkCount: chunks.length,
      indexStatus: "keyword",
    };
  }
  async list(owner: string): Promise<KnowledgeSummary[]> {
    await this.ensureSchema();
    const rows = await this.db
      .prepare(
        "SELECT id, title, kind, created_at, updated_at, char_count, chunk_count, index_status FROM knowledge_documents WHERE owner_hash = ? ORDER BY updated_at DESC, id LIMIT ?",
      )
      .bind(owner, KNOWLEDGE_LIMITS.documents)
      .all<DocumentRow>();
    return rows.results.map(summary);
  }
  async find(owner: string, id: string): Promise<KnowledgeDocument | null> {
    await this.ensureSchema();
    const row = await this.db
      .prepare(
        "SELECT id, title, kind, content, created_at, updated_at, char_count, chunk_count, index_status FROM knowledge_documents WHERE id = ? AND owner_hash = ?",
      )
      .bind(id, owner)
      .first<DocumentRow>();
    return row ? { ...summary(row), content: row.content } : null;
  }
  async markSemantic(owner: string, id: string): Promise<void> {
    await this.db
      .prepare(
        "UPDATE knowledge_documents SET index_status = 'semantic' WHERE id = ? AND owner_hash = ?",
      )
      .bind(id, owner)
      .run();
  }
  async remove(owner: string, id: string): Promise<string[]> {
    await this.ensureSchema();
    const chunks = await this.chunks(owner, [id]);
    await this.db.batch([
      this.db
        .prepare("DELETE FROM knowledge_chunks WHERE document_id = ? AND owner_hash = ?")
        .bind(id, owner),
      this.db
        .prepare("DELETE FROM knowledge_documents WHERE id = ? AND owner_hash = ?")
        .bind(id, owner),
    ]);
    return chunks.map((chunk) => chunk.id);
  }
  async chunks(owner: string, ids?: string[]): Promise<KnowledgeChunk[]> {
    await this.ensureSchema();
    if (ids && !ids.length) return [];
    const selected = ids ? [...new Set(ids)].slice(0, 12) : undefined;
    const clause = selected ? ` AND d.id IN (${selected.map(() => "?").join(",")})` : "";
    const statement = this.db
      .prepare(
        `SELECT c.id, c.document_id, d.title, c.ordinal, c.content, c.line_start, c.line_end FROM knowledge_chunks c JOIN knowledge_documents d ON d.id = c.document_id AND d.owner_hash = c.owner_hash WHERE c.owner_hash = ?${clause} ORDER BY d.updated_at DESC, d.id, c.ordinal LIMIT ?`,
      )
      .bind(owner, ...(selected ?? []), KNOWLEDGE_LIMITS.documents * KNOWLEDGE_LIMITS.chunks);
    const result = await statement.all<ChunkRow>();
    return result.results.map((row) => ({
      id: row.id,
      documentId: row.document_id,
      title: row.title,
      ordinal: row.ordinal,
      content: row.content,
      lineStart: row.line_start,
      lineEnd: row.line_end,
    }));
  }
}
