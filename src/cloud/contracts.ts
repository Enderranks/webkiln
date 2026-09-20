import type { WebKilnProject } from '../types';

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type InvitationStatus = 'pending' | 'accepted' | 'declined';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  status: 'active' | 'disabled';
}
export interface Session {
  user: AuthUser;
  expiresAt: string;
}
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  role: WorkspaceRole;
}
export interface WorkspaceMembership {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  invitationStatus: InvitationStatus;
}
export interface CloudSite {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  customDomain?: string | null;
  status: 'active' | 'archived';
  homepagePageId: string | null;
  currentRevision: number;
  pageCount: number;
  updatedAt: string;
  updatedBy: string;
  published?: boolean;
}
export type CmsFieldType =
  | 'text'
  | 'rich-text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'url'
  | 'image'
  | 'select'
  | 'multi-select'
  | 'reference'
  | 'slug';
export interface CmsField {
  id: string;
  collectionId: string;
  name: string;
  slug: string;
  type: CmsFieldType;
  required: boolean;
  unique: boolean;
  defaultValue?: string | null;
  validation: Record<string, unknown>;
  options: string[];
  referenceCollectionId?: string | null;
  sortOrder: number;
}
export interface CmsCollection {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  permissions: { read: 'published' | 'workspace'; write: 'editor' | 'admin' };
  fields: CmsField[];
  createdAt: string;
  updatedAt: string;
}
export interface CmsRecord {
  id: string;
  collectionId: string;
  workspaceId: string;
  slug: string;
  data: Record<string, unknown>;
  status: 'draft' | 'published';
  createdAt: string;
  updatedAt: string;
}
export interface CmsRecordPage {
  records: CmsRecord[];
  page: number;
  pageSize: number;
  total: number;
}
export type FormFieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'number'
  | 'date'
  | 'time'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'textarea'
  | 'consent'
  | 'hidden';
export interface FormField {
  id: string;
  name: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  options?: string[];
  validation?: Record<string, unknown>;
  conditional?: { field: string; equals: string };
}
export interface FormDefinition {
  id: string;
  siteId: string;
  workspaceId: string;
  name: string;
  slug: string;
  fields: FormField[];
  settings: {
    successMessage?: string;
    failureMessage?: string;
    submissionLimit?: number;
    honeypot?: boolean;
  };
  status: 'active' | 'archived';
}
export interface FormSubmission {
  id: string;
  formId: string;
  data: Record<string, unknown>;
  status: string;
  createdAt: string;
}
export interface AssetMetadata {
  id: string;
  workspaceId: string;
  siteId: string;
  filename: string;
  mimeType: string;
  size: number;
  altText: string;
  caption: string;
  folder: string;
  tags: string[];
  focalPoint: { x: number; y: number };
  width?: number | null;
  height?: number | null;
  contentHash?: string | null;
  brandGroup?: string | null;
  usageCount: number;
  storageStatus: 'local' | 'metadata_only' | 'available' | 'unavailable';
  transformations: { available: boolean; reason?: string };
  createdAt: string;
  updatedAt: string;
}
export interface AutomationGraph {
  conditions: Array<{ field: string; operator: string; value?: string }>;
  actions: Array<{ type: string; config: Record<string, unknown> }>;
}
export interface Automation {
  id: string;
  workspaceId: string;
  name: string;
  triggerType: string;
  graph: AutomationGraph;
  status: 'draft' | 'enabled' | 'disabled';
  retryPolicy: { maxAttempts: number; backoffSeconds: number };
}
export interface AutomationExecution {
  id: string;
  automationId: string;
  eventId: string;
  status: string;
  attempts: number;
  error?: string | null;
  createdAt: string;
}
export interface SiteProject {
  site: CloudSite;
  project: WebKilnProject;
  serverRevision: number;
}
export interface SiteRevision {
  id: string;
  siteId: string;
  revisionNumber: number;
  name: string;
  snapshot: WebKilnProject;
  createdBy: string;
  createdAt: string;
  restoreSourceRevision?: number;
}
export interface PublishedRelease {
  id: string;
  releaseNumber: number;
  sourceRevision: number;
  createdBy: string;
  createdAt: string;
}
export interface PublishStatus {
  published: boolean;
  currentReleaseId: string | null;
  publishedAt: string | null;
  publicUrl: string | null;
  releases: PublishedRelease[];
}
export interface PublishResult {
  published: boolean;
  releaseId?: string;
  releaseNumber?: number;
  sourceRevision?: number;
  publishedAt?: string;
  publicUrl?: string;
  rolledBackTo?: string;
}
export interface SaveProjectRequest {
  project: WebKilnProject;
  expectedRevision: number;
}
export interface ApiErrorShape {
  code:
    | 'UNAUTHENTICATED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'VALIDATION_ERROR'
    | 'CONFLICT'
    | 'REVISION_MISMATCH'
    | 'RATE_LIMITED'
    | 'INTERNAL_FAILURE';
  message: string;
}

export interface AuthProvider {
  getSession(): Promise<Session | null>;
  signIn(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
}

export interface ProjectRepository {
  listWorkspaces(): Promise<Workspace[]>;
  createWorkspace(name: string): Promise<Workspace>;
  listSites(workspaceId: string): Promise<CloudSite[]>;
  createSite(workspaceId: string, name: string): Promise<CloudSite>;
  getProject(siteId: string): Promise<SiteProject>;
  saveProject(siteId: string, request: SaveProjectRequest): Promise<SiteProject>;
  listRevisions(siteId: string): Promise<SiteRevision[]>;
  createRevision(siteId: string, name: string, expectedRevision: number): Promise<SiteRevision>;
  restoreRevision(
    siteId: string,
    revisionId: string,
    expectedRevision: number,
  ): Promise<SiteProject>;
}

export interface AssetStorageProvider {
  createMetadata(): Promise<never>;
}
export interface DeploymentProvider {
  publish(): Promise<never>;
}
export interface NotificationProvider {
  send(): Promise<never>;
}
