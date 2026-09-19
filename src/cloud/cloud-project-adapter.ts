import type { WebKilnProject } from '../types';
import type { SiteProject } from './contracts';
import { WebKilnApiClient } from './api-client';

export class CloudProjectAdapter {
  constructor(private readonly api: WebKilnApiClient) {}

  async restoreSession() {
    return this.api.getSession();
  }

  async load(siteId: string): Promise<SiteProject> {
    return this.api.getProject(siteId);
  }

  async save(
    siteId: string,
    project: WebKilnProject,
    expectedRevision: number,
  ): Promise<SiteProject> {
    return this.api.saveProject(siteId, { project, expectedRevision });
  }

  async createRevision(siteId: string, name: string, expectedRevision: number) {
    return this.api.createRevision(siteId, name, expectedRevision);
  }

  async restoreRevision(siteId: string, revisionId: string, expectedRevision: number) {
    return this.api.restoreRevision(siteId, revisionId, expectedRevision);
  }
}
