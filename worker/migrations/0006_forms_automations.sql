CREATE TABLE form_definition (
  id TEXT PRIMARY KEY NOT NULL,
  site_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  fields TEXT NOT NULL DEFAULT '[]',
  settings TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX form_site_slug_unique ON form_definition(site_id, slug);
CREATE INDEX form_workspace_lookup ON form_definition(workspace_id);
CREATE TABLE form_submission (
  id TEXT PRIMARY KEY NOT NULL,
  form_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'received',
  idempotency_key TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX form_submission_form_lookup ON form_submission(form_id, created_at);
CREATE INDEX form_submission_workspace_lookup ON form_submission(workspace_id, created_at);
CREATE UNIQUE INDEX form_submission_idempotency_unique ON form_submission(form_id, idempotency_key);
CREATE TABLE automation (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  graph TEXT NOT NULL DEFAULT '{"conditions":[],"actions":[]}',
  status TEXT NOT NULL DEFAULT 'draft',
  retry_policy TEXT NOT NULL DEFAULT '{"maxAttempts":3,"backoffSeconds":10}',
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX automation_workspace_lookup ON automation(workspace_id);
CREATE TABLE automation_execution (
  id TEXT PRIMARY KEY NOT NULL,
  automation_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX automation_execution_idempotency_unique ON automation_execution(automation_id, idempotency_key);
CREATE INDEX automation_execution_workspace_lookup ON automation_execution(workspace_id, created_at);
