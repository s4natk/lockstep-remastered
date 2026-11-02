CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  sql TEXT NOT NULL,
  note TEXT,
  parse_json TEXT,
  citations_json TEXT,
  trace_json TEXT
);
