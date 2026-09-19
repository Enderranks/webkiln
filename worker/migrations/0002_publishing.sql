CREATE TABLE IF NOT EXISTS published_release (
  id TEXT PRIMARY KEY NOT NULL,
  site_id TEXT NOT NULL,
  release_number INTEGER NOT NULL,
  source_revision INTEGER NOT NULL,
  snapshot_data TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS published_release_unique ON published_release(site_id, release_number);
CREATE INDEX IF NOT EXISTS published_release_site_lookup ON published_release(site_id, created_at);

CREATE TABLE IF NOT EXISTS published_site (
  site_id TEXT PRIMARY KEY NOT NULL,
  current_release_id TEXT,
  password_hash TEXT,
  published_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS published_site_release_lookup ON published_site(current_release_id);
