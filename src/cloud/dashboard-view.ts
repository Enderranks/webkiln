import type { WebKilnApiClient } from './api-client';
import type { CloudSite, Session, Workspace } from './contracts';
import { navigate } from './app-router';
import type { LocalProjectStorage } from '../storage/project-storage';
import { createMigrationBackup, previewLocalProject } from './local-import';

const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
const sections = [
  'overview',
  'websites',
  'templates',
  'domains',
  'forms',
  'assets',
  'billing',
  'team',
  'account',
] as const;
type Section = (typeof sections)[number];

export async function renderDashboard(
  cloud: WebKilnApiClient,
  storage: LocalProjectStorage,
  session: Session,
): Promise<void> {
  document.body.innerHTML = `<main class="cloud-app customer-dashboard"><header class="cloud-topbar dashboard-topbar"><a class="cloud-brand" href="/" aria-label="WebKiln home"><span class="brand-mark">W</span><span>WEBKILN</span></a><div class="dashboard-context"><span class="connection-dot"></span><span>Cloud workspace</span></div><div class="account-menu"><details><summary>${esc(session.user.displayName)}</summary><div class="account-popover"><strong>${esc(session.user.displayName)}</strong><small>${esc(session.user.email)}</small><button type="button" data-nav="account">Account settings</button><button type="button" data-signout>Sign out</button></div></details></div></header><div class="dashboard-frame"><aside class="dashboard-sidebar"><p class="sidebar-label">Workspace</p><nav aria-label="Dashboard navigation">${sections.map((section) => `<button type="button" data-nav="${section}" class="dashboard-nav ${section === 'overview' ? 'active' : ''}"><span>${navIcon(section)}</span>${sectionLabel(section)}</button>`).join('')}</nav><div class="sidebar-footer"><button type="button" data-local-editor>Open local editor</button><small>WebKiln customer cloud</small></div></aside><section class="dashboard-main"><div data-dashboard-view></div><div class="cloud-toast" data-dashboard-message role="status" aria-live="polite"></div></section></div></main>`;
  let workspaces: Workspace[] = [];
  let selectedWorkspaceId = '';
  let sites: CloudSite[] = [];
  const view = document.querySelector<HTMLElement>('[data-dashboard-view]')!;
  const message = document.querySelector<HTMLElement>('[data-dashboard-message]')!;
  const say = (text: string) => {
    message.textContent = text;
    window.setTimeout(() => {
      if (message.textContent === text) message.textContent = '';
    }, 3500);
  };
  const loadSites = async () => {
    if (!selectedWorkspaceId) return;
    view.innerHTML = loading('Loading websites');
    try {
      sites = await cloud.listSites(selectedWorkspaceId);
      renderSection('websites');
    } catch (error) {
      view.innerHTML = errorState(error, 'websites');
    }
  };
  const create = async (name: string) => {
    if (!selectedWorkspaceId) return;
    try {
      await cloud.createSite(selectedWorkspaceId, name);
      say('Website created.');
      await loadSites();
    } catch (error) {
      say(error instanceof Error ? error.message : 'Could not create website.');
    }
  };
  const renderSection = (section: Section) => {
    document
      .querySelectorAll<HTMLButtonElement>('[data-nav]')
      .forEach((button) => button.classList.toggle('active', button.dataset.nav === section));
    if (section === 'overview') renderOverview();
    else if (section === 'websites') renderWebsites();
    else if (section === 'templates') renderTemplates();
    else renderUnavailable(section);
  };
  const renderOverview = () => {
    view.innerHTML = `<div class="customer-heading"><div><p class="eyebrow">Overview</p><h1>Good to see you, ${esc(session.user.displayName.split(' ')[0])}.</h1><p>Everything you need to keep your web presence moving.</p></div><button class="primary-btn" data-create-site>New website</button></div><div class="dashboard-stats"><div><small>Websites</small><strong>${sites.length}</strong><span>In this workspace</span></div><div><small>Published</small><strong>${sites.filter((site) => site.published).length}</strong><span>Live experiences</span></div><div><small>Drafts</small><strong>${sites.filter((site) => !site.published).length}</strong><span>Ready to refine</span></div></div><section class="dashboard-panel overview-panel"><div class="panel-title"><div><p class="eyebrow">Recent websites</p><h2>Pick up where you left off</h2></div><button class="text-button" data-nav="websites">View all</button></div>${sites.slice(0, 3).map(siteCard).join('') || empty('No websites yet', 'Create a blank website or start from a template.')}</section><section class="dashboard-panel welcome-panel"><p class="eyebrow">A considered start</p><h2>Build with clarity.</h2><p>WebKiln keeps the details close and the interface calm, so your team can focus on the work visitors actually see.</p></section></div>`;
    bindCommon();
  };
  const renderWebsites = () => {
    view.innerHTML = `<div class="customer-heading"><div><p class="eyebrow">Workspace / Websites</p><h1>Your websites</h1><p>Draft, publish, and manage every WebKiln experience from one place.</p></div><button class="primary-btn" data-create-site>New website</button></div><div class="website-toolbar"><label>Workspace<select data-workspace-select>${workspaces.map((workspace) => `<option value="${esc(workspace.id)}" ${workspace.id === selectedWorkspaceId ? 'selected' : ''}>${esc(workspace.name)}</option>`).join('')}</select></label><span>${sites.length} website${sites.length === 1 ? '' : 's'}</span></div><div class="website-grid">${sites.map(siteCard).join('') || empty('Your first website starts here', 'Choose a blank canvas or a template to get moving.')}</div>`;
    bindCommon();
    document
      .querySelector<HTMLSelectElement>('[data-workspace-select]')
      ?.addEventListener('change', (event) => {
        selectedWorkspaceId = (event.target as HTMLSelectElement).value;
        void loadSites();
      });
  };
  const renderTemplates = () => {
    const templates = [
      ['Editorial studio', 'A composed starting point for a thoughtful brand.'],
      ['Launch page', 'A focused page for a product, service, or announcement.'],
      ['Portfolio system', 'A flexible home for work, case studies, and ideas.'],
    ];
    view.innerHTML = `<div class="customer-heading"><div><p class="eyebrow">Templates</p><h1>Start with a point of view.</h1><p>Each template is a real website starting point, not a decorative demo.</p></div></div><div class="template-grid">${templates.map(([name, description]) => `<article class="template-card"><div class="template-preview"><span></span><i></i><b></b></div><p class="eyebrow">WebKiln template</p><h2>${name}</h2><p>${description}</p><button class="ghost-btn" type="button" data-template="${name}">Use template</button></article>`).join('')}</div>`;
    document
      .querySelectorAll<HTMLButtonElement>('[data-template]')
      .forEach((button) =>
        button.addEventListener(
          'click',
          () => void create(button.dataset.template ?? 'Template website'),
        ),
      );
  };
  const renderUnavailable = (section: Section) => {
    const details: Record<string, [string, string]> = {
      domains: [
        'Domains',
        'Connect a custom domain when you are ready. Domain provisioning is intentionally kept behind the approved provider boundary.',
      ],
      forms: [
        'Form submissions',
        'Submission storage is not enabled in the current free-tier milestone. Existing form blocks remain available in the editor.',
      ],
      assets: [
        'Asset library',
        'Asset metadata and R2-backed storage are reserved for the asset-storage milestone.',
      ],
      billing: [
        'Billing',
        'Billing is disabled. WebKiln’s current testing environment does not collect payments or request a payment method.',
      ],
      team: [
        'Team members',
        'Team membership records are protected by the existing workspace authorization layer. Invitations will be enabled in a later milestone.',
      ],
      account: [
        'Account settings',
        `Signed in as ${session.user.email}. Use the account menu to sign out.`,
      ],
    };
    const [title, description] = details[section];
    view.innerHTML = `<div class="customer-heading"><div><p class="eyebrow">Workspace / ${title}</p><h1>${title}</h1><p>${description}</p></div></div><section class="dashboard-panel unavailable-panel"><span class="status-mark">—</span><h2>Provider boundary</h2><p>This area is visible so the product surface is clear, but no action is presented as complete until its supporting service is available.</p>${section === 'account' ? '<button class="ghost-btn" data-signout>Sign out</button>' : ''}</section>`;
    document.querySelector('[data-signout]')?.addEventListener('click', () => void signOut(cloud));
  };
  const siteCard = (site: CloudSite) => {
    const publicUrl = `${window.location.origin}/sites/${encodeURIComponent(site.slug)}`;
    return `<article class="website-card"><div class="website-thumbnail"><span>W</span><small>${site.published ? 'LIVE' : 'DRAFT'}</small></div><div class="website-card-body"><div class="website-card-head"><div><h2>${esc(site.name)}</h2><p class="website-url">${site.customDomain ? esc(site.customDomain) : publicUrl}</p></div><details class="site-actions"><summary aria-label="Actions for ${esc(site.name)}">•••</summary><div class="site-actions-menu"><button type="button" data-action="rename" data-site="${site.id}">Rename</button><button type="button" data-action="duplicate" data-site="${site.id}">Duplicate</button><button type="button" data-action="domain" data-site="${site.id}">Connect domain</button><button type="button" data-action="archive" data-site="${site.id}">${site.status === 'archived' ? 'Restore website' : 'Archive website'}</button>${site.status === 'archived' ? `<button type="button" data-action="delete" data-site="${site.id}" class="danger-action">Delete permanently</button>` : ''}</div></details></div><div class="website-meta"><span class="status-chip ${site.published ? 'published' : ''}">${site.published ? 'Published' : 'Draft'}</span><span>Edited ${new Date(site.updatedAt).toLocaleDateString()}</span><span>Revision ${site.currentRevision}</span><span class="deployment-status">${site.published ? 'Deployment live' : 'Not deployed'}</span></div><div class="website-actions"><button class="primary-btn" data-action="edit" data-site="${site.id}">Open editor</button><button class="ghost-btn" data-action="preview" data-site="${site.id}">Preview draft</button>${site.published ? `<a class="text-button" href="${publicUrl}" target="_blank" rel="noreferrer">View published</a>` : ''}</div></div></article>`;
  };
  const bindCommon = () => {
    document
      .querySelectorAll<HTMLButtonElement>('[data-action]')
      .forEach((button) =>
        button.addEventListener(
          'click',
          () => void handleSiteAction(button.dataset.action ?? '', button.dataset.site ?? ''),
        ),
      );
    document.querySelector('[data-create-site]')?.addEventListener('click', () => {
      const name = window.prompt('Name your new website');
      if (name?.trim()) void create(name.trim());
    });
    document
      .querySelectorAll<HTMLElement>('[data-nav]')
      .forEach((button) =>
        button.addEventListener('click', () => renderSection(button.dataset.nav as Section)),
      );
  };
  const handleSiteAction = async (action: string, siteId: string) => {
    const site = sites.find((item) => item.id === siteId);
    if (!site) return;
    try {
      if (action === 'edit' || action === 'preview')
        navigate(
          `/editor/${encodeURIComponent(siteId)}${action === 'preview' ? '?preview=1' : ''}`,
        );
      else if (action === 'rename') {
        const name = window.prompt('New website name', site.name);
        if (name?.trim()) {
          await cloud.updateSite(siteId, { name: name.trim() });
          say('Website renamed.');
          await loadSites();
        }
      } else if (action === 'duplicate') {
        const copy = await cloud.duplicateSite(siteId);
        say('Website duplicated.');
        await loadSites();
        navigate(`/editor/${encodeURIComponent(copy.id)}`);
      } else if (action === 'archive') {
        const next = site.status === 'archived' ? 'active' : 'archived';
        if (next === 'archived' && !window.confirm(`Archive ${site.name}?`)) return;
        await cloud.updateSite(siteId, { status: next });
        say(next === 'archived' ? 'Website archived.' : 'Website restored.');
        await loadSites();
      } else if (
        action === 'delete' &&
        window.confirm(`Permanently delete ${site.name}? This cannot be undone.`)
      ) {
        await cloud.deleteSite(siteId);
        say('Website permanently deleted.');
        await loadSites();
      } else if (action === 'domain') {
        const domain = window.prompt(
          'Custom domain (DNS setup is still required)',
          site.customDomain ?? '',
        );
        if (domain?.trim()) {
          await cloud.updateSite(siteId, { customDomain: domain.trim() });
          say('Domain saved. DNS connection remains pending.');
          await loadSites();
        }
      }
    } catch (error) {
      say(error instanceof Error ? error.message : 'Website action failed.');
    }
  };
  const empty = (title: string, copy: string) =>
    `<div class="empty-state dashboard-empty"><strong>${title}</strong><small>${copy}</small></div>`;
  const loading = (text: string) => `<div class="cloud-loading">${text}…</div>`;
  const errorState = (error: unknown, section: Section) =>
    `<div class="error-state">${esc(error instanceof Error ? error.message : 'Could not load this area.')} <button type="button" data-nav="${section}">Retry</button></div>`;
  const navIcon = (section: string) =>
    ({
      overview: '◌',
      websites: '◈',
      templates: '✦',
      domains: '⌁',
      forms: '▤',
      assets: '▧',
      billing: '◒',
      team: '◎',
      account: '⚙',
    })[section] ?? '•';
  const sectionLabel = (section: string) => section.charAt(0).toUpperCase() + section.slice(1);
  const signOut = async (client: WebKilnApiClient) => {
    await client.signOut().catch(() => undefined);
    navigate('/login');
  };
  document
    .querySelectorAll<HTMLElement>('[data-nav]')
    .forEach((button) =>
      button.addEventListener('click', () => renderSection(button.dataset.nav as Section)),
    );
  document.querySelector('[data-local-editor]')?.addEventListener('click', () => navigate('/'));
  document.querySelector('[data-signout]')?.addEventListener('click', () => void signOut(cloud));
  view.innerHTML = loading('Loading workspace');
  try {
    workspaces = await cloud.listWorkspaces();
    selectedWorkspaceId = workspaces[0]?.id ?? '';
    if (selectedWorkspaceId) sites = await cloud.listSites(selectedWorkspaceId);
    renderSection('overview');
  } catch (error) {
    view.innerHTML = errorState(error, 'overview');
  }
  try {
    const local = storage.load();
    const preview = previewLocalProject(JSON.stringify(local));
    if (preview.summary.pageCount > 0 && selectedWorkspaceId) {
      const card = document.createElement('div');
      card.className = 'migration-card';
      card.innerHTML = `<div><p class="eyebrow">Local project found</p><strong>${esc(local.site.title)}</strong><small>${preview.summary.pageCount} pages · import keeps a local backup</small></div><button class="ghost-btn" type="button">Import local project</button>`;
      card.querySelector('button')?.addEventListener('click', async () => {
        if (!window.confirm('Import this project as a new cloud website?')) return;
        createMigrationBackup(preview.project);
        const site = await cloud.createSite(
          selectedWorkspaceId,
          preview.project.site.title || 'Imported website',
        );
        await cloud.saveProject(site.id, {
          project: preview.project,
          expectedRevision: site.currentRevision,
        });
        navigate(`/editor/${encodeURIComponent(site.id)}`);
      });
      view.append(card);
    }
  } catch {
    /* local recovery is optional */
  }
}
