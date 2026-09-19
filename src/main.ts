import { GrapesJSEditorAdapter } from './editor';
import { WebKilnEditorController } from './editor/webkiln-controller';
import { LocalProjectStorage } from './storage/project-storage';
import type { WebKilnProject } from './types';
import { WebKilnApiClient } from './cloud/api-client';
import { CloudProjectAdapter } from './cloud/cloud-project-adapter';
import { CloudEditorSync } from './cloud/cloud-editor-sync';
import { parseRoute, navigate } from './cloud/app-router';
import { renderAuthView } from './cloud/auth-view';
import { renderDashboard } from './cloud/dashboard-view';
import type { Session, SiteProject, SiteRevision } from './cloud/contracts';
import { protectedRedirect } from './cloud/protected-route';
import { EditingExperienceController } from './editor/editing-experience';
import { DesignGuardianController } from './editor/design-guardian';

const cloud = new WebKilnApiClient();
const storage = new LocalProjectStorage();

async function boot(): Promise<void> {
  const route = parseRoute();
  if (route.kind === 'login' || route.kind === 'signup') {
    await renderAuthView(cloud, route.kind);
    return;
  }
  if (route.kind === 'dashboard' || route.kind === 'editor') {
    if (!cloud.configured) {
      navigate('/');
      return;
    }
    if (route.kind === 'dashboard') {
      document.body.innerHTML =
        '<main class="cloud-app auth-app"><div class="auth-loading" role="status">Restoring your session…</div></main>';
    } else {
      document.documentElement.dataset.sessionState = 'loading';
    }
    try {
      const session = await cloud.getSession();
      const redirect = protectedRedirect(route, session);
      if (!session) {
        navigate(redirect ?? '/login');
        return;
      }
      document.documentElement.dataset.sessionState = 'authenticated';
      if (route.kind === 'dashboard') {
        await renderDashboard(cloud, storage, session);
        return;
      }
      await bootCloudEditor(route.siteId, session);
    } catch (error) {
      renderCloudFailure(error instanceof Error ? error.message : 'Could not open WebKiln.');
    }
    return;
  }
  await bootEditor();
}

async function bootEditor(siteId?: string, remote?: SiteProject): Promise<void> {
  const canvas = document.querySelector<HTMLElement>('#siteCanvas');
  if (!canvas) throw new Error('WebKiln canvas was not found');
  const project = storage.load();
  const adapter = new GrapesJSEditorAdapter(canvas);
  const cloudProject = new CloudProjectAdapter(cloud);
  if (remote) Object.assign(project, remote.project);
  window.WebKiln = {
    ...(window.WebKiln ?? {}),
    adapter,
    project,
    storage,
    cloud,
    cloudProject,
    cloudConfigured: cloud.configured,
  };
  window.WebKiln.recoverLegacy = () => storage.restoreLatestLegacy();
  try {
    await adapter.initialize();
    ensurePages(project, adapter.exportProjectData());
    const currentPage = project.pages.find((page) => page.id === project.currentPageId);
    if (currentPage?.projectData) adapter.loadProjectData(currentPage.projectData);
    const editorController = new WebKilnEditorController(adapter, project, storage);
    editorController.start();
    new EditingExperienceController(adapter, project, () =>
      editorController.markDirty('Responsive settings'),
    ).start();
    new DesignGuardianController(adapter, project, () =>
      editorController.markDirty('Design system'),
    ).start();
    renderAccountMenu(cloud);
    renderCloudStatus(cloud, siteId);
    if (siteId && remote) {
      const sync = new CloudEditorSync(
        adapter,
        project,
        storage,
        cloud,
        siteId,
        remote.serverRevision,
        renderSyncState,
        (latest) => {
          const active = window.WebKiln?.cloudSync;
          if (active instanceof CloudEditorSync) renderConflict(active, latest);
        },
      );
      sync.start();
      void renderRevisions(cloud, siteId, remote.serverRevision);
      void renderPublishPanel(cloud, siteId, remote.serverRevision);
      bindPublishButton(cloud, siteId, sync);
      window.WebKiln.cloudSync = sync;
    }
    document.documentElement.dataset.editorEngine = 'grapesjs';
    document
      .querySelector('#saveState')
      ?.replaceChildren(document.createTextNode('✓ Saved · GrapesJS'));
  } catch (error) {
    document.documentElement.dataset.editorEngine = 'grapesjs-error';
    document.querySelector('#saveState')?.replaceChildren(document.createTextNode('Editor error'));
    console.error(error);
  }
}

function bindPublishButton(client: WebKilnApiClient, siteId: string, sync: CloudEditorSync): void {
  document.querySelector('#publishBtn')?.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      openPublishDialog(client, siteId, sync);
    },
    true,
  );
}

function openPublishDialog(client: WebKilnApiClient, siteId: string, sync: CloudEditorSync): void {
  document.querySelector('[data-publish-dialog]')?.remove();
  const backdrop = document.createElement('div');
  backdrop.dataset.publishDialog = 'true';
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML =
    '<section class="setup-modal publish-modal" role="dialog" aria-modal="true" aria-labelledby="publishTitle"><div class="modal-head"><div><p class="eyebrow">Public website</p><h2 id="publishTitle">Publish this version?</h2></div><button class="mini-btn" data-close-publish type="button" aria-label="Close publish dialog">×</button></div><p class="modal-copy">WebKiln will create an immutable published snapshot. Existing public visitors keep seeing the current version until you confirm.</p><label class="field">Optional site password<input data-publish-password type="password" autocomplete="new-password" placeholder="Leave blank for public access" /></label><p class="cloud-error" data-publish-error hidden></p><div class="modal-actions"><button class="ghost-btn" data-close-publish type="button">Cancel</button><button class="primary-btn" data-confirm-publish type="button">Publish version</button></div></section>';
  document.body.append(backdrop);
  const close = () => backdrop.remove();
  backdrop
    .querySelectorAll('[data-close-publish]')
    .forEach((button) => button.addEventListener('click', close));
  backdrop.querySelector('[data-confirm-publish]')?.addEventListener('click', async () => {
    const button = backdrop.querySelector<HTMLButtonElement>('[data-confirm-publish]');
    const error = backdrop.querySelector<HTMLElement>('[data-publish-error]');
    const password = backdrop.querySelector<HTMLInputElement>('[data-publish-password]')?.value;
    if (button) {
      button.disabled = true;
      button.textContent = 'Publishing…';
    }
    try {
      const result = await client.publishSite(siteId, sync.currentRevision, password);
      close();
      renderSyncState('saved');
      showToast(
        'Site published',
        result.publicUrl ? `Public at ${result.publicUrl}` : 'Your latest version is live.',
      );
      void renderPublishPanel(client, siteId, sync.currentRevision);
    } catch (publishError) {
      if (error) {
        error.textContent =
          publishError instanceof Error ? publishError.message : 'Publishing failed.';
        error.hidden = false;
      }
      if (button) {
        button.disabled = false;
        button.textContent = 'Publish version';
      }
    }
  });
}

async function renderPublishPanel(
  client: WebKilnApiClient,
  siteId: string,
  _revision: number,
): Promise<void> {
  const panel = document.querySelector('#sitePanel');
  if (!panel) return;
  panel.querySelector('[data-publish-panel]')?.remove();
  const card = document.createElement('div');
  card.dataset.publishPanel = 'true';
  card.className = 'recovery-card publish-panel';
  card.innerHTML =
    '<strong>Public website</strong><small>Loading publish history…</small><div data-publish-history></div>';
  panel.append(card);
  try {
    const status = await client.getPublishStatus(siteId);
    const history = card.querySelector<HTMLElement>('[data-publish-history]');
    const statusLine = status.published
      ? `Published · ${new Date(status.publishedAt ?? '').toLocaleString()}`
      : 'Draft only · not public';
    card.querySelector('small')!.textContent = statusLine;
    if (history)
      history.innerHTML = status.releases.length
        ? status.releases
            .slice(0, 8)
            .map(
              (release) =>
                `<div class="revision-row"><span><b>Release ${release.releaseNumber}</b>${release.id === status.currentReleaseId ? ' · Live' : ''}<small>Source revision ${release.sourceRevision} · ${new Date(release.createdAt).toLocaleString()}</small></span>${release.id !== status.currentReleaseId ? `<button type="button" data-rollback="${escapeHtml(release.id)}">Rollback</button>` : ''}</div>`,
            )
            .join('')
        : '<small>No published versions yet.</small>';
    history?.querySelectorAll<HTMLButtonElement>('[data-rollback]').forEach((button) =>
      button.addEventListener('click', async () => {
        button.disabled = true;
        await client.rollbackPublishedSite(siteId, button.dataset.rollback ?? '');
        await renderPublishPanel(client, siteId, _revision);
        showToast('Published version restored', 'The selected immutable release is live again.');
      }),
    );
    if (status.published) {
      const unpublish = document.createElement('button');
      unpublish.type = 'button';
      unpublish.textContent = 'Unpublish';
      unpublish.addEventListener('click', async () => {
        await client.unpublishSite(siteId);
        await renderPublishPanel(client, siteId, _revision);
        showToast('Site unpublished', 'The public URL now returns not found.');
      });
      card.append(unpublish);
    }
  } catch {
    card.querySelector('small')!.textContent = 'Publish history unavailable.';
  }
}

async function bootCloudEditor(siteId: string, session: Session): Promise<void> {
  void session;
  await bootEditor(siteId, await cloud.getProject(siteId));
}

function renderCloudStatus(client: WebKilnApiClient, siteId?: string): void {
  const topActions = document.querySelector('.top-actions');
  if (topActions && !topActions.querySelector('[data-cloud-sync]')) {
    const state = document.createElement('span');
    state.id = 'cloudSyncState';
    state.dataset.cloudSync = 'true';
    state.textContent = siteId
      ? 'Cloud ready'
      : client.configured
        ? 'Cloud available'
        : 'Local only';
    topActions.prepend(state);
  }
  const panel = document.querySelector('#sitePanel');
  if (!panel || panel.querySelector('[data-cloud-status]')) return;
  const card = document.createElement('div');
  card.dataset.cloudStatus = 'true';
  card.className = 'recovery-card cloud-status-card';
  card.innerHTML = client.configured
    ? `<strong>${siteId ? 'Cloud project connected' : 'Cloud workspace ready'}</strong><small>${siteId ? 'Changes are saved to the authenticated WebKiln workspace.' : 'Open a cloud site from the dashboard to sync this editor.'}</small><div><button type="button" data-open-dashboard>Dashboard</button>${siteId ? '<button type="button" data-save-local>Save local recovery copy</button>' : ''}</div>`
    : '<strong>Local-only mode</strong><small>No secure WebKiln backend is configured. Projects remain in this browser.</small>';
  panel.append(card);
  card
    .querySelector('[data-open-dashboard]')
    ?.addEventListener('click', () => navigate('/dashboard'));
  card.querySelector('[data-save-local]')?.addEventListener('click', () => {
    const project = window.WebKiln?.project;
    if (project) storage.save(project);
    showToast('Local recovery copy saved', 'Your current project is safe in this browser.');
  });
}

function renderAccountMenu(client: WebKilnApiClient): void {
  if (!client.configured) return;
  const actions = document.querySelector('.top-actions');
  if (!actions || actions.querySelector('[data-editor-account]')) return;
  const menu = document.createElement('details');
  menu.dataset.editorAccount = 'true';
  menu.className = 'editor-account';
  menu.innerHTML =
    '<summary aria-label="Open account menu">Account</summary><div class="account-popover"><span data-account-loading>Loading account…</span><a href="/dashboard">Dashboard</a><button type="button" data-editor-signout>Sign out</button></div>';
  actions.append(menu);
  void client.getSession().then((session) => {
    const loading = menu.querySelector('[data-account-loading]');
    if (loading)
      loading.innerHTML = session
        ? `<strong>${escapeHtml(session.user.displayName)}</strong><small>${escapeHtml(session.user.email)}</small><em>● Cloud connected</em>`
        : '<strong>Signed out</strong>';
  });
  menu.querySelector('[data-editor-signout]')?.addEventListener('click', async () => {
    await client.signOut().catch(() => undefined);
    navigate('/login');
  });
}

function renderSyncState(state: 'saved' | 'saving' | 'offline' | 'failed' | 'conflict'): void {
  const element = document.querySelector<HTMLElement>('#cloudSyncState');
  if (!element) return;
  const labels = {
    saved: 'Cloud saved',
    saving: 'Saving to cloud…',
    offline: 'Offline · local copy safe',
    failed: 'Cloud save failed',
    conflict: 'Conflict · review needed',
  };
  element.textContent = labels[state];
  element.dataset.state = state;
}

function renderConflict(sync: CloudEditorSync, latest: SiteProject): void {
  sync.setConflict(latest);
  if (document.querySelector('[data-conflict-card]')) return;
  const panel = document.querySelector('#sitePanel');
  if (!panel) return;
  const card = document.createElement('div');
  card.dataset.conflictCard = 'true';
  card.className = 'recovery-card cloud-conflict-card';
  card.innerHTML =
    '<strong>Cloud version changed</strong><small>WebKiln did not overwrite newer data. Reload the cloud version or keep a local recovery copy.</small><div><button type="button" data-reload-cloud>Reload cloud version</button><button type="button" data-save-local>Save local recovery copy</button></div>';
  panel.append(card);
  card.querySelector('[data-reload-cloud]')?.addEventListener('click', async () => {
    const route = parseRoute();
    if (route.kind !== 'editor') return;
    const fresh = await cloud.getProject(route.siteId);
    sync.reloadRemote(fresh);
    card.remove();
  });
  card.querySelector('[data-save-local]')?.addEventListener('click', () => {
    const project = window.WebKiln?.project;
    if (project) storage.save(project);
    showToast('Local recovery copy saved', 'Resolve the conflict before saving again.');
  });
}

async function renderRevisions(
  client: WebKilnApiClient,
  siteId: string,
  current: number,
): Promise<void> {
  const panel = document.querySelector('#sitePanel');
  if (!panel) return;
  const card = document.createElement('div');
  card.className = 'recovery-card cloud-revisions-card';
  card.innerHTML =
    '<strong>Cloud revisions</strong><small>Loading revision history…</small><div data-revision-list></div>';
  panel.append(card);
  try {
    const revisions = await client.listRevisions(siteId);
    const list = card.querySelector<HTMLElement>('[data-revision-list]');
    if (list)
      list.innerHTML = revisions.length
        ? revisions
            .map(
              (revision: SiteRevision) =>
                `<div class="revision-row"><span><b>Revision ${revision.revisionNumber}</b>${revision.revisionNumber === current ? ' · Current' : ''}<small>${escapeHtml(revision.name)} · ${new Date(revision.createdAt).toLocaleString()}</small></span></div>`,
            )
            .join('')
        : '<small>No named cloud revisions yet.</small>';
  } catch {
    const status = card.querySelector('small');
    if (status) status.textContent = 'Revision history unavailable.';
  }
}

function renderCloudFailure(message: string): void {
  document.body.innerHTML = `<main class="cloud-app auth-app"><section class="auth-card"><a class="cloud-brand" href="/">WEBKILN</a><p class="eyebrow">Something went wrong</p><h1>We couldn’t open this cloud project.</h1><p class="cloud-error">${escapeHtml(message)}</p><div class="modal-actions"><button class="ghost-btn" data-back-dashboard>Dashboard</button><button class="primary-btn" data-retry>Retry</button></div></section></main>`;
  document
    .querySelector('[data-back-dashboard]')
    ?.addEventListener('click', () => navigate('/dashboard'));
  document.querySelector('[data-retry]')?.addEventListener('click', () => window.location.reload());
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
}
function showToast(title: string, detail: string): void {
  const toast = document.querySelector<HTMLElement>('#toast');
  if (toast) {
    toast.hidden = false;
    toast.querySelector('strong')!.textContent = title;
    toast.querySelector('small')!.textContent = detail;
    window.setTimeout(() => {
      toast.hidden = true;
    }, 3500);
  }
}

function ensurePages(project: WebKilnProject, initialData: unknown): void {
  if (project.pages.length) return;
  project.pages = [
    {
      id: 'home',
      name: 'Home',
      slug: '/',
      projectData: initialData,
      updatedAt: new Date().toISOString(),
      isHomepage: true,
      seo: { title: 'Home', description: '' },
      settings: { showInNavigation: true, passwordProtected: false },
    },
    {
      id: 'game-hosting',
      name: 'Game Hosting',
      slug: '/game-hosting',
      projectData: null,
      updatedAt: new Date().toISOString(),
      seo: { title: 'Game Hosting', description: '' },
      settings: { showInNavigation: true, passwordProtected: false },
    },
    {
      id: 'support',
      name: 'Support',
      slug: '/support',
      projectData: null,
      updatedAt: new Date().toISOString(),
      seo: { title: 'Support', description: '' },
      settings: { showInNavigation: true, passwordProtected: false },
    },
  ];
  project.currentPageId = 'home';
  project.homepagePageId = 'home';
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', () => void boot());
else void boot();
