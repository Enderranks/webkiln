import { describe, expect, it, vi } from 'vitest';
import { CloudApiError, WebKilnApiClient } from '../src/cloud/api-client';
import { createEmptyProject } from '../src/models/project-schema';

describe('WebKiln cloud API client', () => {
  it('uses credentials and maps Better Auth sessions for auth and workspace flows', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const payload =
        path.includes('get-session') || path.includes('sign-in')
          ? {
              user: { id: 'u1', email: 'qa@example.test', name: 'QA' },
              session: { expiresAt: 'later' },
            }
          : path === '/api/workspaces'
            ? { id: 'w1', name: 'QA', slug: 'qa', ownerUserId: 'u1', role: 'owner' }
            : path.includes('/sites') && init?.method === 'POST'
              ? {
                  id: 's1',
                  workspaceId: 'w1',
                  name: 'Site',
                  slug: 'site',
                  status: 'active',
                  currentRevision: 0,
                }
              : { success: true };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new WebKilnApiClient('https://cloud.example.test');
    const session = await client.signIn('qa@example.test', 'password');
    const workspace = await client.createWorkspace('QA');
    const site = await client.createSite(workspace.id, 'Site');
    await client.signOut();
    expect(session.user.displayName).toBe('QA');
    expect(site.id).toBe('s1');
    expect(fetchMock.mock.calls.every(([, init]) => init?.credentials === 'include')).toBe(true);
  });

  it('returns project data and surfaces revision conflicts', async () => {
    const project = createEmptyProject();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT')
        return new Response(
          JSON.stringify({ error: { code: 'REVISION_MISMATCH', message: 'Newer data exists' } }),
          { status: 409 },
        );
      return new Response(JSON.stringify({ site: { id: 's1' }, project, serverRevision: 4 }), {
        status: 200,
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new WebKilnApiClient('https://cloud.example.test');
    expect((await client.getProject('s1')).serverRevision).toBe(4);
    await expect(client.saveProject('s1', { project, expectedRevision: 3 })).rejects.toBeInstanceOf(
      CloudApiError,
    );
  });
});
