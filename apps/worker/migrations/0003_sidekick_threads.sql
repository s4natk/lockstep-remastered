CREATE TABLE IF NOT EXISTS sidekick_threads (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  last_preview TEXT NOT NULL DEFAULT '',
  context_ids_json TEXT NOT NULL DEFAULT '[]',
  active_turn_id TEXT,
  lease_expires_at TEXT
);
CREATE INDEX IF NOT EXISTS sidekick_threads_owner_updated ON sidekick_threads(owner_hash, updated_at DESC);
CREATE TABLE IF NOT EXISTS sidekick_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  owner_hash TEXT NOT NULL,
  client_turn_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  report_json TEXT,
  mode TEXT,
  context_ids_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE(thread_id, owner_hash, client_turn_id, role)
);
CREATE INDEX IF NOT EXISTS sidekick_messages_thread_created ON sidekick_messages(thread_id, owner_hash, created_at);

CREATE TABLE IF NOT EXISTS sidekick_turn_inputs (thread_id TEXT NOT NULL, owner_hash TEXT NOT NULL, client_turn_id TEXT NOT NULL, request_json TEXT NOT NULL, PRIMARY KEY(thread_id, owner_hash, client_turn_id));
