CREATE TABLE cms_collection (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '{"read":"published","write":"editor"}',
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX cms_collection_workspace_slug ON cms_collection(workspace_id, slug);
CREATE INDEX cms_collection_workspace_lookup ON cms_collection(workspace_id);
CREATE TABLE cms_field (
  id TEXT PRIMARY KEY NOT NULL,
  collection_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  type TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0,
  is_unique INTEGER NOT NULL DEFAULT 0,
  default_value TEXT,
  validation TEXT NOT NULL DEFAULT '{}',
  options TEXT NOT NULL DEFAULT '[]',
  reference_collection_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX cms_field_collection_slug ON cms_field(collection_id, slug);
CREATE INDEX cms_field_collection_lookup ON cms_field(collection_id);
CREATE TABLE cms_record (
  id TEXT PRIMARY KEY NOT NULL,
  collection_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX cms_record_collection_slug ON cms_record(collection_id, slug);
CREATE INDEX cms_record_collection_status_lookup ON cms_record(collection_id, status);
CREATE INDEX cms_record_workspace_lookup ON cms_record(workspace_id);
