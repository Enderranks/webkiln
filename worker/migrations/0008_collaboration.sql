-- Expand legacy membership roles without changing existing member identity rows.
CREATE TABLE workspace_membership_v20 (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, invitation_status TEXT NOT NULL DEFAULT 'accepted', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(workspace_id, user_id));
INSERT INTO workspace_membership_v20 SELECT id, workspace_id, user_id, CASE role WHEN 'admin' THEN 'administrator' WHEN 'editor' THEN 'designer' ELSE role END, invitation_status, created_at, updated_at FROM workspace_membership;
DROP TABLE workspace_membership;
ALTER TABLE workspace_membership_v20 RENAME TO workspace_membership;
CREATE INDEX membership_workspace_lookup ON workspace_membership(workspace_id);
CREATE INDEX membership_user_lookup ON workspace_membership(user_id);
CREATE TABLE collaboration_invite (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, invitation_status TEXT NOT NULL DEFAULT 'pending', expires_at INTEGER NOT NULL, invited_by TEXT NOT NULL, created_at INTEGER NOT NULL, accepted_at INTEGER);
CREATE INDEX collaboration_invite_workspace_lookup ON collaboration_invite(workspace_id, created_at);
CREATE TABLE page_permission (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, site_id TEXT NOT NULL, page_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(page_id, user_id));
CREATE INDEX page_permission_workspace_lookup ON page_permission(workspace_id);
CREATE TABLE review_comment (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, site_id TEXT NOT NULL, page_id TEXT, component_id TEXT, body TEXT NOT NULL, mentions TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'open', created_by TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX review_comment_site_lookup ON review_comment(site_id, created_at);
CREATE INDEX review_comment_workspace_lookup ON review_comment(workspace_id);
CREATE TABLE approval_request (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, site_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', note TEXT NOT NULL DEFAULT '', requested_by TEXT NOT NULL, reviewed_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX approval_site_lookup ON approval_request(site_id, created_at);
CREATE INDEX approval_workspace_lookup ON approval_request(workspace_id);
CREATE TABLE review_link (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, site_id TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'review', token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX review_link_site_lookup ON review_link(site_id, expires_at);
