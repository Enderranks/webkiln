import { describe, expect, it, vi } from 'vitest';
import { parseRoute } from '../src/cloud/app-router';
import { protectedRedirect } from '../src/cloud/protected-route';
import { CloudAutosaveQueue } from '../src/cloud/autosave-queue';
import { createEmptyProject } from '../src/models/project-schema';
import type { ProjectRepository, SiteProject } from '../src/cloud/contracts';

const project = createEmptyProject();
const siteProject: SiteProject = {
  site: {
    id: 'site-1',
    workspaceId: 'workspace-1',
    name: 'Test',
    slug: 'test',
    status: 'active',
    homepagePageId: 'home',
    currentRevision: 1,
    pageCount: 0,
    updatedAt: '',
    updatedBy: 'user-1',
  },
  project,
  serverRevision: 1,
};

describe('cloud application routing', () => {
  it('parses protected views and preserves site ids', () => {
    expect(parseRoute('/login')).toEqual({ kind: 'login' });
    expect(parseRoute('/editor/site%2Fone')).toEqual({ kind: 'editor', siteId: 'site/one' });
    expect(protectedRedirect({ kind: 'dashboard' }, null)).toContain(
      '/login?returnTo=%2Fdashboard',
    );
    expect(protectedRedirect({ kind: 'local' }, null)).toBeNull();
  });
});

describe('cloud autosave behavior', () => {
  it('confirms successful saves and queues changes without overlapping requests', async () => {
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    let calls = 0;
    const repository = {
      saveProject: vi.fn(async () => {
        calls += 1;
        await Promise.resolve();
        return siteProject;
      }),
    } as unknown as ProjectRepository;
    const states: string[] = [];
    const queue = new CloudAutosaveQueue(repository, 'site-1', 0, (state) => states.push(state));
    queue.queue(project);
    queue.queue(project);
    await queue.flush();
    expect(calls).toBe(1);
    expect(states).toContain('saved');
  });

  it('blocks automatic retries after a revision conflict', async () => {
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    const repository = {
      saveProject: vi.fn(async () => {
        throw Object.assign(new Error('REVISION_MISMATCH'), { status: 409 });
      }),
    } as unknown as ProjectRepository;
    const states: string[] = [];
    const queue = new CloudAutosaveQueue(repository, 'site-1', 0, (state) => states.push(state));
    queue.queue(project);
    await queue.flush();
    queue.queue(project);
    expect(repository.saveProject).toHaveBeenCalledTimes(1);
    expect(states).toContain('conflict');
  });

  it('reports temporary network failures without claiming saved', async () => {
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    const repository = {
      saveProject: vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    } as unknown as ProjectRepository;
    const states: string[] = [];
    const queue = new CloudAutosaveQueue(repository, 'site-1', 0, (state) => states.push(state));
    queue.queue(project);
    await queue.flush();
    expect(states.at(-1)).toBe('offline');
    expect(states).not.toContain('saved');
  });
});
