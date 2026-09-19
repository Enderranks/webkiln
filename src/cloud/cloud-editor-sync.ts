import type { GrapesJSEditorAdapter } from '../editor/grapesjs-adapter';
import type { LocalProjectStorage } from '../storage/project-storage';
import type { WebKilnProject } from '../types';
import { CloudAutosaveQueue, type SyncState } from './autosave-queue';
import type { ProjectRepository, SiteProject } from './contracts';

export class CloudEditorSync {
  private readonly queue: CloudAutosaveQueue;
  private unsubscribe: (() => void) | undefined;
  private conflict: SiteProject | null = null;
  constructor(
    private readonly adapter: GrapesJSEditorAdapter,
    private readonly project: WebKilnProject,
    private readonly storage: LocalProjectStorage,
    repository: ProjectRepository,
    siteId: string,
    revision: number,
    private readonly onState: (state: SyncState) => void,
    private readonly onConflict: (remote: SiteProject) => void,
  ) {
    this.queue = new CloudAutosaveQueue(repository, siteId, revision, (state) => {
      this.onState(state);
      if (state === 'conflict') {
        void repository
          .getProject(siteId)
          .then((remote) => {
            this.conflict = remote;
            this.onConflict(remote);
          })
          .catch(() => undefined);
      }
    });
  }
  start(): void {
    this.unsubscribe = this.adapter.subscribe('update', () => this.captureAndQueue());
  }
  captureAndQueue(): void {
    const page = this.project.pages.find((item) => item.id === this.project.currentPageId);
    if (page) {
      page.projectData = this.adapter.exportProjectData();
      page.updatedAt = new Date().toISOString();
    }
    this.storage.save(this.project);
    this.queue.queue(this.project);
  }
  async flush(): Promise<SiteProject | null> {
    return this.queue.flush();
  }
  setConflict(remote: SiteProject): void {
    this.conflict = remote;
  }
  get remoteConflict(): SiteProject | null {
    return this.conflict;
  }
  reloadRemote(remote: SiteProject): void {
    Object.assign(this.project, remote.project);
    this.adapter.loadProjectData(
      this.project.pages.find((page) => page.id === this.project.currentPageId)?.projectData ?? {},
    );
    this.storage.save(this.project);
    this.queue.unblockWithRevision(remote.serverRevision);
    this.conflict = null;
    this.onState('saved');
  }
  destroy(): void {
    this.unsubscribe?.();
  }
}
