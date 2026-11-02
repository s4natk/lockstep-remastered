CREATE TABLE IF NOT EXISTS investigations (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  mode TEXT,
  report_json TEXT
);
CREATE INDEX IF NOT EXISTS investigations_owner_created ON investigations(owner_hash, created_at DESC);
CREATE TABLE IF NOT EXISTS investigation_limits (
  bucket TEXT NOT NULL,
  owner_hash TEXT NOT NULL,
  requests INTEGER NOT NULL,
  PRIMARY KEY(bucket, owner_hash)
);
CREATE TABLE IF NOT EXISTS session_owners(id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL);
