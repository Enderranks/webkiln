import type { WebKilnApiClient } from './api-client';
import type { CloudSite, Session, Workspace } from './contracts';
import { createMigrationBackup, previewLocalProject } from './local-import';
import type { LocalProjectStorage } from '../storage/project-storage';
import { navigate } from './app-router';

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
}

export async function renderDashboard(
  cloud: WebKilnApiClient,
  storage: LocalProjectStorage,
  session: Session,
): Promise<void> {
  document.body.innerHTML = `
    <main class="cloud-app dashboard-app">
      <header class="cloud-topbar"><a class="cloud-brand" href="/" aria-label="WebKiln home"><span class="brand-mark">W</span><span>WEBKILN</span></a><div class="account-menu"><span class="connection-dot"></span><span>Cloud connected</span><details><summary>${escapeHtml(session.user.displayName)}</summary><div class="account-popover"><strong>${escapeHtml(session.user.displayName)}</strong><small>${escapeHtml(session.user.email)}</small><a href="/dashboard">Dashboard</a><button type="button" data-signout>Sign out</button></div></details></div></header>
      <section class="dashboard-content"><div class="dashboard-heading"><div><p class="eyebrow">Your workspace</p><h1>Build what’s next.</h1><p>Manage your WebKiln sites and jump back into the visual editor.</p></div><button class="ghost-btn" data-local-editor>Open local editor</button></div>
      <div class="dashboard-grid"><section class="dashboard-panel" aria-labelledby="workspace-heading"><div class="panel-title"><div><p class="eyebrow">Workspace</p><h2 id="workspace-heading">Spaces to build in</h2></div><button class="mini-btn" data-new-workspace aria-label="Create workspace">＋</button></div><div data-workspace-list class="workspace-list"><div class="cloud-loading">Loading workspaces…</div></div><form data-workspace-form class="inline-form" hidden><input name="name" placeholder="Workspace name" aria-label="Workspace name" required maxlength="80"/><button class="primary-btn" type="submit">Create</button></form></section>
      <section class="dashboard-panel sites-panel" aria-labelledby="sites-heading"><div class="panel-title"><div><p class="eyebrow">Sites</p><h2 id="sites-heading">Choose a project</h2></div><button class="mini-btn" data-new-site aria-label="Create site" disabled>＋</button></div><div data-site-list class="site-list"><div class="empty-state">Select a workspace to see its sites.</div></div><form data-site-form class="inline-form" hidden><input name="name" placeholder="Site name" aria-label="Site name" required maxlength="80"/><button class="primary-btn" type="submit">Create site</button></form></section></div>
      <section class="migration-card" data-migration-card hidden><div><p class="eyebrow">Local project found</p><h2>Bring your local work to the cloud</h2><p data-migration-summary></p></div><button class="ghost-btn" data-import-local>Import local project</button></section>
      </section><div class="cloud-toast" data-dashboard-message role="status" aria-live="polite"></div>
    </main>`;
  bindSignOut(cloud);
  document.querySelector('[data-local-editor]')?.addEventListener('click', () => navigate('/'));
  const local = storage.load();
  const raw = JSON.stringify(local);
  try {
    const preview = previewLocalProject(raw);
    const migration = document.querySelector<HTMLElement>('[data-migration-card]');
    const summary = document.querySelector<HTMLElement>('[data-migration-summary]');
    if (migration && summary && preview.summary.pageCount > 0) {
      summary.textContent = `${local.site.title} · ${preview.summary.pageCount} pages · ${raw.length.toLocaleString()} bytes · schema ${local.schemaVersion}. Import creates a new cloud site and keeps a local backup.`;
      migration.hidden = false;
      document
        .querySelector('[data-import-local]')
        ?.addEventListener('click', () =>
          openImportDialog(cloud, storage, preview, selectedWorkspaceId),
        );
    }
  } catch {
    /* A malformed local project should not block the dashboard. */
  }
  let selectedWorkspaceId = '';
  let workspaces: Workspace[] = [];
  let sites: CloudSite[] = [];
  const workspaceList = document.querySelector<HTMLElement>('[data-workspace-list]');
  const siteList = document.querySelector<HTMLElement>('[data-site-list]');
  const workspaceForm = document.querySelector<HTMLFormElement>('[data-workspace-form]');
  const siteForm = document.querySelector<HTMLFormElement>('[data-site-form]');
  const newSite = document.querySelector<HTMLButtonElement>('[data-new-site]');
  const message = document.querySelector<HTMLElement>('[data-dashboard-message]');
  const say = (text: string) => {
    if (message) message.textContent = text;
  };
  const loadSites = async (workspaceId: string) => {
    selectedWorkspaceId = workspaceId;
    if (siteList) siteList.innerHTML = '<div class="cloud-loading">Loading sites…</div>';
    if (newSite) newSite.disabled = false;
    try {
      sites = await cloud.listSites(workspaceId);
      renderSites();
    } catch (error) {
      if (siteList)
        siteList.innerHTML = `<div class="error-state">${escapeHtml(error instanceof Error ? error.message : 'Could not load sites.')} <button data-retry-sites type="button">Retry</button></div>`;
      document
        .querySelector('[data-retry-sites]')
        ?.addEventListener('click', () => void loadSites(workspaceId));
    }
  };
  const renderSites = () => {
    if (!siteList) return;
    siteList.innerHTML = sites.length
      ? sites
          .map(
            (site) =>
              `<button class="site-card" data-site-id="${escapeHtml(site.id)}"><span class="site-icon">◈</span><span><strong>${escapeHtml(site.name)} ${site.published ? '<em class="published-badge">Published</em>' : ''}</strong><small>${site.pageCount} pages · revision ${site.currentRevision}</small></span><span>→</span></button>`,
          )
          .join('')
      : '<div class="empty-state"><strong>No sites yet.</strong><small>Create your first cloud site to start syncing.</small></div>';
    siteList
      .querySelectorAll<HTMLButtonElement>('[data-site-id]')
      .forEach((button) =>
        button.addEventListener('click', () =>
          navigate(`/editor/${encodeURIComponent(button.dataset.siteId ?? '')}`),
        ),
      );
  };
  const renderWorkspaces = () => {
    if (!workspaceList) return;
    workspaceList.innerHTML = workspaces.length
      ? workspaces
          .map(
            (workspace) =>
              `<button class="workspace-card ${workspace.id === selectedWorkspaceId ? 'selected' : ''}" data-workspace-id="${escapeHtml(workspace.id)}"><span class="workspace-icon">${escapeHtml(workspace.name.slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(workspace.name)}</strong><small>${escapeHtml(workspace.role)} · ${escapeHtml(workspace.slug)}</small></span><span>→</span></button>`,
          )
          .join('')
      : '<div class="empty-state"><strong>Your first workspace starts here.</strong><small>Create a workspace to organize cloud sites.</small></div>';
    workspaceList.querySelectorAll<HTMLButtonElement>('[data-workspace-id]').forEach((button) =>
      button.addEventListener('click', () => {
        renderWorkspaces();
        void loadSites(button.dataset.workspaceId ?? '');
      }),
    );
  };
  try {
    workspaces = await cloud.listWorkspaces();
    renderWorkspaces();
    if (workspaces[0]) await loadSites(workspaces[0].id);
  } catch (error) {
    if (workspaceList)
      workspaceList.innerHTML = `<div class="error-state">${escapeHtml(error instanceof Error ? error.message : 'Could not load workspaces.')} <button data-retry-workspaces type="button">Retry</button></div>`;
    document
      .querySelector('[data-retry-workspaces]')
      ?.addEventListener('click', () => window.location.reload());
  }
  document.querySelector('[data-new-workspace]')?.addEventListener('click', () => {
    if (workspaceForm) workspaceForm.hidden = !workspaceForm.hidden;
    workspaceForm?.querySelector('input')?.focus();
  });
  workspaceForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = String(new FormData(workspaceForm).get('name') ?? '').trim();
    if (!name) return;
    try {
      const workspace = await cloud.createWorkspace(name);
      workspaces = [...workspaces, workspace];
      workspaceForm.reset();
      workspaceForm.hidden = true;
      renderWorkspaces();
      await loadSites(workspace.id);
      say('Workspace created.');
    } catch (error) {
      say(error instanceof Error ? error.message : 'Workspace creation failed.');
    }
  });
  newSite?.addEventListener('click', () => {
    if (siteForm) siteForm.hidden = !siteForm.hidden;
    siteForm?.querySelector('input')?.focus();
  });
  siteForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!selectedWorkspaceId) return;
    const name = String(new FormData(siteForm).get('name') ?? '').trim();
    if (!name) return;
    try {
      await cloud.createSite(selectedWorkspaceId, name);
      siteForm.reset();
      siteForm.hidden = true;
      await loadSites(selectedWorkspaceId);
      say('Site created.');
    } catch (error) {
      say(error instanceof Error ? error.message : 'Site creation failed.');
    }
  });
}

function bindSignOut(cloud: WebKilnApiClient): void {
  document.querySelector('[data-signout]')?.addEventListener('click', async () => {
    await cloud.signOut().catch(() => undefined);
    navigate('/login');
  });
}

async function openImportDialog(
  cloud: WebKilnApiClient,
  storage: LocalProjectStorage,
  preview: ReturnType<typeof previewLocalProject>,
  workspaceId: string,
): Promise<void> {
  if (!workspaceId) {
    window.alert('Select a workspace before importing.');
    return;
  }
  const confirmed = window.confirm(
    `Import ${preview.project.site.title} with ${preview.summary.pageCount} pages (${JSON.stringify(preview.project).length.toLocaleString()} bytes) as a new cloud site? A local backup will be preserved.`,
  );
  if (!confirmed) return;
  createMigrationBackup(preview.project);
  const site = await cloud.createSite(
    workspaceId,
    preview.project.site.title || 'Imported WebKiln site',
  );
  await cloud.saveProject(site.id, {
    project: preview.project,
    expectedRevision: site.currentRevision,
  });
  storage.save(preview.project);
  navigate(`/editor/${encodeURIComponent(site.id)}`);
}
