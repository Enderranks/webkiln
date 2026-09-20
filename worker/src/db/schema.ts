import { integer, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
};

export const workspace = sqliteTable(
  'workspace',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    ownerUserId: text('owner_user_id').notNull(),
    ...timestamps,
  },
  (table) => ({
    slugUnique: uniqueIndex('workspace_slug_unique').on(table.slug),
    ownerLookup: index('workspace_owner_lookup').on(table.ownerUserId),
  }),
);

export const workspaceMembership = sqliteTable(
  'workspace_membership',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    userId: text('user_id').notNull(),
    role: text('role').notNull(),
    invitationStatus: text('invitation_status').notNull().default('accepted'),
    ...timestamps,
  },
  (table) => ({
    membershipUnique: uniqueIndex('workspace_membership_unique').on(
      table.workspaceId,
      table.userId,
    ),
    workspaceLookup: index('membership_workspace_lookup').on(table.workspaceId),
    userLookup: index('membership_user_lookup').on(table.userId),
  }),
);

export const site = sqliteTable(
  'site',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    customDomain: text('custom_domain'),
    status: text('status').notNull().default('active'),
    homepagePageId: text('homepage_page_id'),
    projectSchemaVersion: integer('project_schema_version').notNull().default(2),
    themeData: text('theme_data').notNull().default('{}'),
    editorSettings: text('editor_settings').notNull().default('{}'),
    settingsData: text('settings_data').notNull().default('{}'),
    customCodeMetadata: text('custom_code_metadata').notNull().default('{}'),
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by').notNull(),
    currentRevision: integer('current_revision').notNull().default(0),
    ...timestamps,
  },
  (table) => ({
    siteSlugUnique: uniqueIndex('site_workspace_slug_unique').on(table.workspaceId, table.slug),
    siteWorkspaceLookup: index('site_workspace_lookup').on(table.workspaceId),
  }),
);

export const page = sqliteTable(
  'page',
  {
    id: text('id').primaryKey(),
    siteId: text('site_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    homepage: integer('homepage', { mode: 'boolean' }).notNull().default(false),
    showInNavigation: integer('show_in_navigation', { mode: 'boolean' }).notNull().default(true),
    passwordProtected: integer('password_protected', { mode: 'boolean' }).notNull().default(false),
    seoTitle: text('seo_title').notNull().default(''),
    seoDescription: text('seo_description').notNull().default(''),
    canonicalUrl: text('canonical_url'),
    projectData: text('project_data').notNull().default('{}'),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    ...timestamps,
  },
  (table) => ({
    pageSlugUnique: uniqueIndex('page_site_slug_unique').on(table.siteId, table.slug),
    pageSiteLookup: index('page_site_lookup').on(table.siteId),
    deletedLookup: index('page_deleted_lookup').on(table.siteId, table.deletedAt),
  }),
);

export const siteRevision = sqliteTable(
  'site_revision',
  {
    id: text('id').primaryKey(),
    siteId: text('site_id').notNull(),
    revisionNumber: integer('revision_number').notNull(),
    name: text('name').notNull(),
    snapshotData: text('snapshot_data').notNull(),
    createdBy: text('created_by').notNull(),
    restoreSourceRevision: integer('restore_source_revision'),
    ...timestamps,
  },
  (table) => ({
    revisionUnique: uniqueIndex('site_revision_unique').on(table.siteId, table.revisionNumber),
    revisionSiteLookup: index('revision_site_lookup').on(table.siteId),
  }),
);

export const assetMetadata = sqliteTable('asset_metadata', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  siteId: text('site_id').notNull(),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  altText: text('alt_text').notNull().default(''),
  storageStatus: text('storage_status').notNull().default('metadata_only'),
  createdBy: text('created_by').notNull(),
  ...timestamps,
});

export const cmsCollection = sqliteTable(
  'cms_collection',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    permissions: text('permissions').notNull().default('{"read":"published","write":"editor"}'),
    createdBy: text('created_by').notNull(),
    ...timestamps,
  },
  (table) => ({
    slugUnique: uniqueIndex('cms_collection_workspace_slug').on(table.workspaceId, table.slug),
    workspaceLookup: index('cms_collection_workspace_lookup').on(table.workspaceId),
  }),
);

export const cmsField = sqliteTable(
  'cms_field',
  {
    id: text('id').primaryKey(),
    collectionId: text('collection_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    type: text('type').notNull(),
    required: integer('required', { mode: 'boolean' }).notNull().default(false),
    isUnique: integer('is_unique', { mode: 'boolean' }).notNull().default(false),
    defaultValue: text('default_value'),
    validation: text('validation').notNull().default('{}'),
    options: text('options').notNull().default('[]'),
    referenceCollectionId: text('reference_collection_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => ({
    fieldSlugUnique: uniqueIndex('cms_field_collection_slug').on(table.collectionId, table.slug),
    collectionLookup: index('cms_field_collection_lookup').on(table.collectionId),
  }),
);

export const cmsRecord = sqliteTable(
  'cms_record',
  {
    id: text('id').primaryKey(),
    collectionId: text('collection_id').notNull(),
    workspaceId: text('workspace_id').notNull(),
    slug: text('slug').notNull(),
    data: text('data').notNull().default('{}'),
    status: text('status').notNull().default('draft'),
    createdBy: text('created_by').notNull(),
    ...timestamps,
  },
  (table) => ({
    recordSlugUnique: uniqueIndex('cms_record_collection_slug').on(table.collectionId, table.slug),
    collectionStatusLookup: index('cms_record_collection_status_lookup').on(
      table.collectionId,
      table.status,
    ),
    workspaceLookup: index('cms_record_workspace_lookup').on(table.workspaceId),
  }),
);
export const auditEvent = sqliteTable(
  'audit_event',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    userId: text('user_id').notNull(),
    siteId: text('site_id'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    metadata: text('metadata').notNull().default('{}'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => ({
    auditWorkspaceLookup: index('audit_workspace_lookup').on(table.workspaceId, table.createdAt),
  }),
);

export const publishedRelease = sqliteTable(
  'published_release',
  {
    id: text('id').primaryKey(),
    siteId: text('site_id').notNull(),
    releaseNumber: integer('release_number').notNull(),
    sourceRevision: integer('source_revision').notNull(),
    snapshotData: text('snapshot_data').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => ({
    releaseUnique: uniqueIndex('published_release_unique').on(table.siteId, table.releaseNumber),
    releaseSiteLookup: index('published_release_site_lookup').on(table.siteId, table.createdAt),
  }),
);

export const publishedSite = sqliteTable(
  'published_site',
  {
    siteId: text('site_id').primaryKey(),
    currentReleaseId: text('current_release_id'),
    passwordHash: text('password_hash'),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => ({
    currentReleaseLookup: index('published_site_release_lookup').on(table.currentReleaseId),
  }),
);
