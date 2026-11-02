CREATE TABLE IF NOT EXISTS knowledge_documents (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  char_count INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL,
  index_status TEXT NOT NULL DEFAULT 'keyword'
);
CREATE INDEX IF NOT EXISTS knowledge_owner_updated ON knowledge_documents(owner_hash, updated_at DESC);
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  owner_hash TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  content TEXT NOT NULL,
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS knowledge_chunks_owner_document ON knowledge_chunks(owner_hash, document_id, ordinal);
