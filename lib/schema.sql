CREATE TABLE IF NOT EXISTS repositories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('zip', 'url')),
  source TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS author_merges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  canonical_name TEXT NOT NULL,
  canonical_email TEXT NOT NULL,
  merged_email TEXT NOT NULL,
  CHECK (merged_email <> canonical_email),
  UNIQUE (repository_id, merged_email)
);

CREATE INDEX IF NOT EXISTS idx_author_merges_repository ON author_merges (repository_id);
