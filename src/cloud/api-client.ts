import type {
  ApiErrorShape,
  AuthProvider,
  CloudSite,
  ProjectRepository,
  Session,
  SiteProject,
  SiteRevision,
  SaveProjectRequest,
  Workspace,
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
  constructor(baseUrl = import.meta.env.VITE_WEBKILN_API_URL ?? '') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }
  get configured(): boolean {
    return Boolean(this.baseUrl);
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
  getSession(): Promise<Session | null> {
    return this.request<Session | null>('/api/auth/session');
  }
  signIn(email: string, password: string): Promise<Session> {
    return this.request('/api/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
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
}
