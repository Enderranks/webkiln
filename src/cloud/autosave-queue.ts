import type { ProjectRepository, SiteProject } from './contracts';
import { validateProjectPayload } from './validation';
import type { WebKilnProject } from '../types';

export type SyncState = 'saved' | 'saving' | 'offline' | 'failed' | 'conflict';

export class CloudAutosaveQueue {
  private pending: WebKilnProject | null = null;
  private timer: number | undefined;
  private saving = false;
  private blockedByConflict = false;
  private revision: number;
  constructor(
    private readonly repository: ProjectRepository,
    private readonly siteId: string,
    initialRevision: number,
    private readonly onState: (state: SyncState) => void,
  ) {
    this.revision = initialRevision;
  }
  queue(project: WebKilnProject): void {
    if (this.blockedByConflict) return;
    this.pending = validateProjectPayload(project);
    this.onState('saving');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.flush(), 450);
  }
  async flush(): Promise<SiteProject | null> {
    if (this.saving || !this.pending) return null;
    this.saving = true;
    const project = this.pending;
    this.pending = null;
    try {
      const result = await this.repository.saveProject(this.siteId, {
        project,
        expectedRevision: this.revision,
      });
      this.revision = result.serverRevision;
      this.onState('saved');
      return result;
    } catch (error) {
      this.pending = project;
      const isConflict =
        error instanceof Error &&
        (error.message.includes('CONFLICT') ||
          error.message.includes('REVISION_MISMATCH') ||
          ('status' in error && (error as { status?: number }).status === 409));
      if (isConflict) {
        this.blockedByConflict = true;
        this.pending = null;
      }
      this.onState(isConflict ? 'conflict' : error instanceof TypeError ? 'offline' : 'failed');
      return null;
    } finally {
      this.saving = false;
      if (this.pending && !this.blockedByConflict) window.setTimeout(() => void this.flush(), 50);
    }
  }
  get pendingProject(): WebKilnProject | null {
    return this.pending;
  }
  get currentRevision(): number {
    return this.revision;
  }
  unblockWithRevision(revision: number): void {
    this.revision = revision;
    this.blockedByConflict = false;
  }
}
