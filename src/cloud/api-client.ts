import type {
  ApiErrorShape,
  AuthProvider,
  CloudSite,
  ProjectRepository,
  Session,
  SiteProject,
  SiteRevision,
  PublishResult,
  PublishStatus,
  SaveProjectRequest,
  Workspace,
  CmsCollection,
  CmsRecord,
  CmsRecordPage,
} from './contracts';

export class CloudApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly details: ApiErrorShape,
  ) {
    super(details.message);
  }
}

export class WebKilnApiClient implements ProjectRepository, AuthProvider {
  private readonly baseUrl: string;
  private readonly sameOrigin: boolean;
  constructor(baseUrl = import.meta.env.VITE_WEBKILN_API_URL ?? '') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.sameOrigin = import.meta.env.VITE_WEBKILN_CLOUD_MODE === 'true';
  }
  get configured(): boolean {
    return Boolean(this.baseUrl) || this.sameOrigin;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.configured) throw new Error('CLOUD_BACKEND_NOT_CONFIGURED');
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    if (!response.ok) {
      const details = (await response
        .json()
        .catch(() => ({ code: 'INTERNAL_FAILURE', message: 'Request failed' }))) as ApiErrorShape;
      throw new CloudApiError(response.status, details);
    }
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }
  private normalizeSession(response: BetterAuthSessionResponse | null): Session | null {
    if (!response?.user || !response.session) return null;
    return {
      user: {
        id: response.user.id,
        email: response.user.email,
        displayName: response.user.name,
        status: 'active',
      },
      expiresAt: String(response.session.expiresAt),
    };
  }
  async getSession(): Promise<Session | null> {
    return this.normalizeSession(
      await this.request<BetterAuthSessionResponse | null>('/api/auth/get-session'),
    );
  }
  async signUp(name: string, email: string, password: string): Promise<Session> {
    return this.normalizeSession(
      await this.request<BetterAuthSessionResponse>('/api/auth/sign-up/email', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      }),
    ) as Session;
  }
  async signIn(email: string, password: string): Promise<Session> {
    return this.normalizeSession(
      await this.request<BetterAuthSessionResponse>('/api/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    ) as Session;
  }
  signOut(): Promise<void> {
    return this.request('/api/auth/sign-out', { method: 'POST' });
  }
  requestPasswordReset(email: string): Promise<void> {
    return this.request('/api/auth/password-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }
  listWorkspaces(): Promise<Workspace[]> {
    return this.request('/api/workspaces');
  }
  createWorkspace(name: string): Promise<Workspace> {
    return this.request('/api/workspaces', { method: 'POST', body: JSON.stringify({ name }) });
  }
  listSites(workspaceId: string): Promise<CloudSite[]> {
    return this.request(`/api/workspaces/${encodeURIComponent(workspaceId)}/sites`);
  }
  createSite(workspaceId: string, name: string): Promise<CloudSite> {
    return this.request(`/api/workspaces/${encodeURIComponent(workspaceId)}/sites`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }
  updateSite(
    siteId: string,
    update: { name?: string; status?: 'active' | 'archived'; customDomain?: string | null },
  ): Promise<void> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    });
  }
  duplicateSite(siteId: string, name?: string): Promise<CloudSite> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }
  deleteSite(siteId: string): Promise<void> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}`, { method: 'DELETE' });
  }
  listCollections(workspaceId: string): Promise<CmsCollection[]> {
    return this.request(`/api/workspaces/${encodeURIComponent(workspaceId)}/collections`);
  }
  createCollection(
    workspaceId: string,
    input: { name: string; fields: unknown[] },
  ): Promise<CmsCollection> {
    return this.request(`/api/workspaces/${encodeURIComponent(workspaceId)}/collections`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  listRecords(collectionId: string, query = ''): Promise<CmsRecordPage> {
    return this.request(
      `/api/collections/${encodeURIComponent(collectionId)}/records${query ? `?${query}` : ''}`,
    );
  }
  createRecord(
    collectionId: string,
    data: Record<string, unknown>,
    status: 'draft' | 'published' = 'draft',
  ): Promise<CmsRecord> {
    return this.request(`/api/collections/${encodeURIComponent(collectionId)}/records`, {
      method: 'POST',
      body: JSON.stringify({ data, status }),
    });
  }
  updateRecord(
    recordId: string,
    data: Record<string, unknown>,
    status?: 'draft' | 'published',
  ): Promise<CmsRecord> {
    return this.request(`/api/records/${encodeURIComponent(recordId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ data, ...(status ? { status } : {}) }),
    });
  }
  deleteRecord(recordId: string): Promise<void> {
    return this.request(`/api/records/${encodeURIComponent(recordId)}`, { method: 'DELETE' });
  }
  exportCollection(collectionId: string): Promise<string> {
    return fetch(`${this.baseUrl}/api/collections/${encodeURIComponent(collectionId)}/export`, {
      credentials: 'include',
    }).then((response) => {
      if (!response.ok) throw new Error('Could not export collection');
      return response.text();
    });
  }
  importCollection(collectionId: string, csv: string): Promise<{ imported: number }> {
    return this.request(`/api/collections/${encodeURIComponent(collectionId)}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      body: csv,
    });
  }
  getProject(siteId: string): Promise<SiteProject> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/project`);
  }
  saveProject(siteId: string, request: SaveProjectRequest): Promise<SiteProject> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/project`, {
      method: 'PUT',
      body: JSON.stringify(request),
    });
  }
  listRevisions(siteId: string): Promise<SiteRevision[]> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/revisions`);
  }
  createRevision(siteId: string, name: string, expectedRevision: number): Promise<SiteRevision> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/revisions`, {
      method: 'POST',
      body: JSON.stringify({ name, expectedRevision }),
    });
  }
  restoreRevision(
    siteId: string,
    revisionId: string,
    expectedRevision: number,
  ): Promise<SiteProject> {
    return this.request(
      `/api/sites/${encodeURIComponent(siteId)}/revisions/${encodeURIComponent(revisionId)}/restore`,
      { method: 'POST', body: JSON.stringify({ expectedRevision }) },
    );
  }
  getPublishStatus(siteId: string): Promise<PublishStatus> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/publish-status`);
  }
  publishSite(siteId: string, expectedRevision: number, password?: string): Promise<PublishResult> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/publish`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision, ...(password ? { password } : {}) }),
    });
  }
  unpublishSite(siteId: string): Promise<PublishResult> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/unpublish`, { method: 'POST' });
  }
  rollbackPublishedSite(siteId: string, releaseId: string): Promise<PublishResult> {
    return this.request(
      `/api/sites/${encodeURIComponent(siteId)}/publish/${encodeURIComponent(releaseId)}/rollback`,
      { method: 'POST' },
    );
  }
}

interface BetterAuthSessionResponse {
  user?: { id: string; email: string; name: string };
  session?: { expiresAt: string | Date };
}
