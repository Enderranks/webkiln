import type { WebKilnApiClient } from './api-client';
import type {
  AssetMetadata,
  CloudSite,
  FormDefinition,
  FormField,
  FormFieldType,
  FormSubmission,
  Session,
  Workspace,
} from './contracts';
import { navigate } from './app-router';
import type { LocalProjectStorage } from '../storage/project-storage';
import { createMigrationBackup, previewLocalProject } from './local-import';
import { findDuplicateAssetIds } from '../assets/asset-storage';
import { createProjectBackup, createStaticExport } from '../portability/export';
import { WEBKILN_TEMPLATES } from './template-catalog';
import { FORM_FIELD_TYPES, validateFormFields } from './form-builder';

const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
const sections = [
  'overview',
  'analytics',
  'websites',
  'collections',
  'automations',
  'templates',
  'domains',
  'forms',
  'assets',
  'billing',
  'team',
  'account',
] as const;
type Section = (typeof sections)[number];

export type WebsiteFilter = 'all' | 'drafts' | 'published' | 'archived';
export type WebsiteSort = 'recent' | 'name' | 'status';

export function filterAndSortWebsites(
  sites: CloudSite[],
  query = '',
  filter: WebsiteFilter = 'all',
  sort: WebsiteSort = 'recent',
): CloudSite[] {
  const normalizedQuery = query.trim().toLowerCase();
  return sites
    .filter((site) => {
      const matchesQuery =
        !normalizedQuery ||
        [site.name, site.slug, site.customDomain ?? ''].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        );
      const matchesFilter =
        filter === 'all' ||
        (filter === 'archived' && site.status === 'archived') ||
        (filter === 'drafts' && site.status !== 'archived' && !site.published) ||
        (filter === 'published' && site.status !== 'archived' && site.published === true);
      return matchesQuery && matchesFilter;
    })
    .sort((left, right) => {
      if (sort === 'name') return left.name.localeCompare(right.name);
      if (sort === 'status') {
        const statusOrder = (site: CloudSite) =>
          site.status === 'archived' ? 2 : site.published ? 1 : 0;
        return statusOrder(left) - statusOrder(right) || left.name.localeCompare(right.name);
      }
      return Date.parse(right.updatedAt || '') - Date.parse(left.updatedAt || '');
    });
}

export async function renderDashboard(
  cloud: WebKilnApiClient,
  storage: LocalProjectStorage,
  session: Session,
  initialSection = 'overview',
  initialWorkspaceId = '',
): Promise<void> {
  document.body.innerHTML = `<main class="cloud-app customer-dashboard"><header class="cloud-topbar dashboard-topbar"><a class="cloud-brand" href="/" aria-label="WebKiln home"><span class="brand-mark">W</span><span>WEBKILN</span></a><div class="dashboard-context"><span class="connection-dot"></span><span>Cloud workspace</span></div><div class="account-menu"><details><summary>${esc(session.user.displayName)}</summary><div class="account-popover"><strong>${esc(session.user.displayName)}</strong><small>${esc(session.user.email)}</small><button type="button" data-nav="account">Account settings</button><button type="button" data-signout>Sign out</button></div></details></div></header><div class="dashboard-frame"><aside class="dashboard-sidebar"><p class="sidebar-label">Workspace</p><nav aria-label="Dashboard navigation">${sections.map((section) => `<button type="button" data-nav="${section}" class="dashboard-nav ${section === 'overview' ? 'active' : ''}"><span>${navIcon(section)}</span>${sectionLabel(section)}</button>`).join('')}</nav><div class="sidebar-footer"><button type="button" data-local-editor>Open local editor</button><small>WebKiln customer cloud</small></div></aside><section class="dashboard-main"><div data-dashboard-view></div><div class="cloud-toast" data-dashboard-message role="status" aria-live="polite"></div></section></div></main>`;
  let workspaces: Workspace[] = [];
  let selectedWorkspaceId = initialWorkspaceId;
  let sites: CloudSite[] = [];
  let duplicateIds = new Set<string>();
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
  const renderSection = (section: Section) => {
    document
      .querySelectorAll<HTMLButtonElement>('[data-nav]')
      .forEach((button) => button.classList.toggle('active', button.dataset.nav === section));
    if (section === 'overview') renderOverview();
    else if (section === 'analytics') renderAnalytics();
    else if (section === 'websites') renderWebsites();
    else if (section === 'collections') void renderCollections();
    else if (section === 'automations') void renderAutomations();
    else if (section === 'forms') void renderForms();
    else if (section === 'assets') void renderAssets();
    else if (section === 'team') void renderTeam();
    else if (section === 'templates') renderTemplates();
    else renderUnavailable(section);
  };
  const renderOverview = () => {
    view.innerHTML = `<div class="customer-heading"><div><p class="eyebrow">Overview</p><h1>Good to see you, ${esc(session.user.displayName.split(' ')[0])}.</h1><p>Everything you need to keep your web presence moving.</p></div><button class="primary-btn" data-create-site>New website</button></div><div class="dashboard-stats"><div><small>Websites</small><strong>${sites.length}</strong><span>In this workspace</span></div><div><small>Published</small><strong>${sites.filter((site) => site.published).length}</strong><span>Live experiences</span></div><div><small>Drafts</small><strong>${sites.filter((site) => !site.published).length}</strong><span>Ready to refine</span></div></div><section class="dashboard-panel overview-panel"><div class="panel-title"><div><p class="eyebrow">Recent websites</p><h2>Pick up where you left off</h2></div><button class="text-button" data-nav="websites">View all</button></div>${sites.slice(0, 3).map(siteCard).join('') || empty('No websites yet', 'Create a blank website or start from a template.')}</section><section class="dashboard-panel welcome-panel"><p class="eyebrow">A considered start</p><h2>Build with clarity.</h2><p>WebKiln keeps the details close and the interface calm, so your team can focus on the work visitors actually see.</p></section></div>`;
    bindCommon();
  };
  const renderAnalytics = () => {
    const totalPages = sites.reduce((sum, site) => sum + site.pageCount, 0);
    const revisions = sites.reduce((sum, site) => sum + site.currentRevision, 0);
    view.innerHTML = `<div class="customer-heading"><div><p class="eyebrow">Workspace / Analytics</p><h1>Understand what is ready.</h1><p>Calculated workspace signals are available now. Visitor analytics require a configured analytics provider and are not invented here.</p></div></div><div class="dashboard-stats"><div><small>Websites</small><strong>${sites.length}</strong><span>Calculated from workspace data</span></div><div><small>Published</small><strong>${sites.filter((site) => site.published).length}</strong><span>Calculated from deployment state</span></div><div><small>Pages</small><strong>${totalPages}</strong><span>Calculated from site metadata</span></div><div><small>Revisions</small><strong>${revisions}</strong><span>Calculated from saved revisions</span></div></div><section class="dashboard-panel analytics-panel"><div class="panel-title"><div><p class="eyebrow">Production measurements</p><h2>Analytics provider not connected</h2></div><span class="status-chip">Unavailable</span></div><p>WebKiln does not currently collect page views, visitors, conversion events, referrers, or performance telemetry. No external analytics script or paid observability service is enabled.</p><div class="analytics-unavailable-grid"><div><strong>Visitors</strong><small>Unavailable until an approved provider is configured.</small></div><div><strong>Conversions</strong><small>Unavailable until event tracking is explicitly enabled.</small></div><div><strong>Performance</strong><small>Use Site Health for calculated checks; production measurements remain unavailable.</small></div></div></section></div>`;
  };
  const renderWebsites = () => {
    view.innerHTML = `<div class="customer-heading"><div><p class="eyebrow">Workspace / Websites</p><h1>Your websites</h1><p>Draft, publish, and manage every WebKiln experience from one place.</p></div><button class="primary-btn" data-create-site>New website</button></div><div class="website-toolbar"><label>Workspace<select data-workspace-select>${workspaces.map((workspace) => `<option value="${esc(workspace.id)}" ${workspace.id === selectedWorkspaceId ? 'selected' : ''}>${esc(workspace.name)}</option>`).join('')}</select></label><label class="website-search">Search websites<input type="search" data-website-search placeholder="Name, slug, or domain" /></label><label>Status<select data-website-filter><option value="all">All websites</option><option value="drafts">Drafts</option><option value="published">Published</option><option value="archived">Archived</option></select></label><label>Sort<select data-website-sort><option value="recent">Recently edited</option><option value="name">Name</option><option value="status">Status</option></select></label><span data-website-count>${sites.length} website${sites.length === 1 ? '' : 's'}</span></div><div class="website-grid" data-website-grid></div>`;
    bindCommon();
    const renderWebsiteGrid = () => {
      const query = document.querySelector<HTMLInputElement>('[data-website-search]')?.value ?? '';
      const filter = (document.querySelector<HTMLSelectElement>('[data-website-filter]')?.value ??
        'all') as WebsiteFilter;
      const sort = (document.querySelector<HTMLSelectElement>('[data-website-sort]')?.value ??
        'recent') as WebsiteSort;
      const filtered = filterAndSortWebsites(sites, query, filter, sort);
      const grid = document.querySelector<HTMLElement>('[data-website-grid]');
      const count = document.querySelector<HTMLElement>('[data-website-count]');
      if (grid)
        grid.innerHTML =
          filtered.map(siteCard).join('') ||
          empty('No matching websites', 'Try a different search or filter.');
      if (count)
        count.textContent = `${filtered.length} website${filtered.length === 1 ? '' : 's'}`;
      bindCommon();
    };
    renderWebsiteGrid();
    document.querySelector('[data-website-search]')?.addEventListener('input', renderWebsiteGrid);
    document.querySelector('[data-website-filter]')?.addEventListener('change', renderWebsiteGrid);
    document.querySelector('[data-website-sort]')?.addEventListener('change', renderWebsiteGrid);
    document
      .querySelector<HTMLSelectElement>('[data-workspace-select]')
      ?.addEventListener('change', (event) => {
        selectedWorkspaceId = (event.target as HTMLSelectElement).value;
        void loadSites();
      });
  };
  const renderTemplates = () => {
    view.innerHTML = `<div class="customer-heading"><div><p class="eyebrow">Templates</p><h1>Start with a point of view.</h1><p>Each template is a real website starting point, not a decorative demo.</p></div></div><div class="template-grid">${WEBKILN_TEMPLATES.map((template) => `<article class="template-card"><div class="template-preview"><span></span><i></i><b></b></div><p class="eyebrow">${esc(template.category)} · ${esc(template.websiteType)}</p><h2>${esc(template.name)}</h2><p>${esc(template.description)}</p><small>${template.pages.length} starter pages · ${esc(template.goal)} goal</small><button class="ghost-btn" type="button" data-template="${template.id}">Use template</button></article>`).join('')}</div>`;
    document
      .querySelectorAll<HTMLButtonElement>('[data-template]')
      .forEach((button) =>
        button.addEventListener('click', () =>
          navigate(
            `/onboarding?template=${encodeURIComponent(button.dataset.template ?? 'blank')}`,
          ),
        ),
      );
  };
  const renderCollections = async () => {
    view.innerHTML = loading('Loading collections');
    try {
      const collections = await cloud.listCollections(selectedWorkspaceId);
      view.innerHTML = `<div class="customer-heading"><div><p class="eyebrow">Workspace / Collections</p><h1>Reusable content</h1><p>Keep structured content separate from layout, then bind it into any page.</p></div><button class="primary-btn" data-create-collection>New collection</button></div><div class="website-grid">${collections.map((collection) => `<article class="dashboard-panel collection-card"><div class="collection-mark">{ }</div><h2>${esc(collection.name)}</h2><p class="website-url">${esc(collection.slug)}</p><div class="website-meta"><span>${collection.fields.length} fields</span><span>${collection.permissions.read} read access</span></div><div class="website-actions"><button class="ghost-btn" data-export-collection="${collection.id}">Export CSV</button><button class="primary-btn" data-records-collection="${collection.id}">View records</button></div></article>`).join('') || empty('No collections yet', 'Create a collection for posts, products, people, or any structured content.')}</div><div data-collection-records></div>`;
      document.querySelector('[data-create-collection]')?.addEventListener('click', async () => {
        const name = window.prompt('Collection name');
        if (!name?.trim()) return;
        try {
          await cloud.createCollection(selectedWorkspaceId, {
            name: name.trim(),
            fields: [
              { name: 'Title', slug: 'title', type: 'text', required: true },
              { name: 'Body', slug: 'body', type: 'rich-text' },
              { name: 'Slug', slug: 'slug', type: 'slug', required: true, unique: true },
            ],
          });
          say('Collection created.');
          await renderCollections();
        } catch (error) {
          say(error instanceof Error ? error.message : 'Could not create collection.');
        }
      });
      document.querySelectorAll<HTMLButtonElement>('[data-export-collection]').forEach((button) =>
        button.addEventListener('click', async () => {
          try {
            const csv = await cloud.exportCollection(button.dataset.exportCollection ?? '');
            const link = document.createElement('a');
            link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
            link.download = 'webkiln-collection.csv';
            link.click();
            URL.revokeObjectURL(link.href);
          } catch (error) {
            say(error instanceof Error ? error.message : 'Export failed.');
          }
        }),
      );
      document.querySelectorAll<HTMLButtonElement>('[data-records-collection]').forEach((button) =>
        button.addEventListener('click', async () => {
          const target = document.querySelector<HTMLElement>('[data-collection-records]');
          if (!target) return;
          try {
            const collectionId = button.dataset.recordsCollection ?? '';
            const collection = collections.find((item) => item.id === collectionId);
            if (!collection) return;
            let pageNumber = 1;
            const renderRecordPage = async (page = 1, search = '', status = '') => {
              const query = new URLSearchParams({ page: String(page), pageSize: '25' });
              if (search) query.set('search', search);
              if (status) query.set('status', status);
              const result = await cloud.listRecords(collectionId, query.toString());
              pageNumber = result.page;
              target.innerHTML = `<section class="dashboard-panel collection-records"><div class="panel-title"><div><h2>${esc(collection.name)} records</h2><span>${result.total} total · page ${result.page}</span></div><button class="primary-btn" type="button" data-new-record>New record</button></div><div class="submission-toolbar"><input type="search" data-record-search placeholder="Search records" aria-label="Search records" value="${esc(search)}" /><select data-record-status aria-label="Filter records"><option value="">All statuses</option><option value="draft" ${status === 'draft' ? 'selected' : ''}>Draft</option><option value="published" ${status === 'published' ? 'selected' : ''}>Published</option></select></div>${result.records.map((record) => `<div class="record-row" data-record-row="${esc(record.id)}"><strong>${esc(record.slug)}</strong><span class="status-chip ${record.status === 'published' ? 'published' : ''}">${record.status}</span><small>${new Date(record.updatedAt).toLocaleString()}</small><button class="ghost-btn" type="button" data-edit-record="${esc(record.id)}">Edit</button><button class="ghost-btn danger-action" type="button" data-delete-record="${esc(record.id)}">Delete</button></div>`).join('') || empty('No records', 'Create the first record for this collection.')}<div class="record-pagination"><button class="ghost-btn" type="button" data-record-prev ${result.page <= 1 ? 'disabled' : ''}>Previous</button><button class="ghost-btn" type="button" data-record-next ${result.page * result.pageSize >= result.total ? 'disabled' : ''}>Next</button></div></section>`;
              target
                .querySelector('[data-record-search]')
                ?.addEventListener(
                  'change',
                  () =>
                    void renderRecordPage(
                      1,
                      (
                        target.querySelector<HTMLInputElement>('[data-record-search]')?.value ?? ''
                      ).trim(),
                      target.querySelector<HTMLSelectElement>('[data-record-status]')?.value ?? '',
                    ),
                );
              target
                .querySelector('[data-record-status]')
                ?.addEventListener(
                  'change',
                  () =>
                    void renderRecordPage(
                      1,
                      target
                        .querySelector<HTMLInputElement>('[data-record-search]')
                        ?.value.trim() ?? '',
                      target.querySelector<HTMLSelectElement>('[data-record-status]')?.value ?? '',
                    ),
                );
              target
                .querySelector('[data-record-prev]')
                ?.addEventListener(
                  'click',
                  () => void renderRecordPage(pageNumber - 1, search, status),
                );
              target
                .querySelector('[data-record-next]')
                ?.addEventListener(
                  'click',
                  () => void renderRecordPage(pageNumber + 1, search, status),
                );
              target.querySelector('[data-new-record]')?.addEventListener('click', async () => {
                const value = window.prompt(
                  'Record JSON',
                  '{"title":"New record","slug":"new-record"}',
                );
                if (!value) return;
                try {
                  const data = JSON.parse(value) as Record<string, unknown>;
                  await cloud.createRecord(collectionId, data, 'draft');
                  say('Draft record created.');
                  await renderRecordPage(pageNumber, search, status);
                } catch (error) {
                  say(
                    error instanceof Error
                      ? error.message
                      : 'Record JSON is invalid or could not be saved.',
                  );
                }
              });
              target.querySelectorAll<HTMLButtonElement>('[data-edit-record]').forEach((action) =>
                action.addEventListener('click', async () => {
                  const record = result.records.find(
                    (item) => item.id === action.dataset.editRecord,
                  );
                  if (!record) return;
                  const value = window.prompt('Record JSON', JSON.stringify(record.data));
                  if (!value) return;
                  try {
                    await cloud.updateRecord(
                      record.id,
                      JSON.parse(value) as Record<string, unknown>,
                    );
                    say('Record updated.');
                    await renderRecordPage(pageNumber, search, status);
                  } catch (error) {
                    say(
                      error instanceof Error
                        ? error.message
                        : 'Record JSON is invalid or could not be updated.',
                    );
                  }
                }),
              );
              target.querySelectorAll<HTMLButtonElement>('[data-delete-record]').forEach((action) =>
                action.addEventListener('click', async () => {
                  if (!window.confirm('Delete this record?')) return;
                  try {
                    await cloud.deleteRecord(action.dataset.deleteRecord ?? '');
                    say('Record deleted.');
                    await renderRecordPage(pageNumber, search, status);
                  } catch (error) {
                    say(error instanceof Error ? error.message : 'Could not delete record.');
                  }
                }),
              );
            };
            await renderRecordPage();
          } catch (error) {
            say(error instanceof Error ? error.message : 'Could not load records.');
          }
        }),
      );
    } catch (error) {
      view.innerHTML = errorState(error, 'collections');
    }
  };
  const renderAutomations = async () => {
    view.innerHTML = loading('Loading automations');
    try {
      const automations = await cloud.listAutomations(selectedWorkspaceId);
      view.innerHTML = `<div class="customer-heading"><div><p class="eyebrow">Workspace / Automations</p><h1>Visual automations</h1><p>Connect a trigger to conditions and actions without exposing credentials to the browser.</p></div><button class="primary-btn" data-create-automation>New automation</button></div><div class="automation-list">${automations.map((flow) => `<article class="dashboard-panel automation-card"><div class="automation-flow"><span class="flow-node">${esc(flow.triggerType)}</span><b>→</b><span class="flow-node">${flow.graph.conditions.length} conditions</span><b>→</b><span class="flow-node">${flow.graph.actions.length} actions</span></div><div class="automation-card-footer"><div><h2>${esc(flow.name)}</h2><small>${flow.status} · retry up to ${flow.retryPolicy.maxAttempts} times</small></div><button class="ghost-btn" data-toggle-automation="${flow.id}" data-status="${flow.status}">${flow.status === 'enabled' ? 'Disable' : 'Enable'}</button></div></article>`).join('') || empty('No automations yet', 'Create a draft flow with a trigger, conditions, and actions.')}</div>`;
      document.querySelector('[data-create-automation]')?.addEventListener('click', async () => {
        const name = window.prompt('Automation name');
        if (!name?.trim()) return;
        try {
          await cloud.createAutomation(selectedWorkspaceId, {
            name: name.trim(),
            triggerType: 'form.submitted',
            graph: { conditions: [], actions: [{ type: 'log-event', config: {} }] },
          });
          say('Draft automation created.');
          await renderAutomations();
        } catch (error) {
          say(error instanceof Error ? error.message : 'Could not create automation.');
        }
      });
      document.querySelectorAll<HTMLButtonElement>('[data-toggle-automation]').forEach((button) =>
        button.addEventListener('click', async () => {
          try {
            const enabled = button.dataset.status !== 'enabled';
            await cloud.updateAutomation(button.dataset.toggleAutomation ?? '', {
              status: enabled ? 'enabled' : 'disabled',
            });
            say(enabled ? 'Automation enabled.' : 'Automation disabled.');
            await renderAutomations();
          } catch (error) {
            say(error instanceof Error ? error.message : 'Could not update automation.');
          }
        }),
      );
    } catch (error) {
      view.innerHTML = errorState(error, 'automations');
    }
  };
  const renderForms = async () => {
    view.innerHTML = loading('Loading forms');
    try {
      const forms = (
        await Promise.all(
          sites.map((site) =>
            cloud
              .listForms(site.id)
              .then((items) => items.map((form) => ({ ...form, siteName: site.name }))),
          ),
        )
      ).flat();
      view.innerHTML = `<div class="customer-heading"><div><p class="eyebrow">Workspace / Forms</p><h1>Production-ready forms</h1><p>Build accessible, validated forms with server-side storage. File uploads are intentionally unavailable.</p></div><button class="primary-btn" data-create-form ${sites[0] ? '' : 'disabled'}>New form</button></div><div class="website-grid">${forms.map((form) => `<article class="dashboard-panel collection-card"><div class="collection-mark">⌁</div><h2>${esc(form.name)}</h2><p class="website-url">${esc(form.siteName)} · /forms/${esc(form.slug)}</p><div class="website-meta"><span>${form.fields.length} fields</span><span>${form.settings.honeypot === false ? 'Honeypot off' : 'Honeypot on'}</span></div><div class="website-actions"><button class="primary-btn" data-submissions-form="${form.id}">View submissions</button><button class="ghost-btn" data-edit-form="${form.id}">Edit fields</button></div></article>`).join('') || empty('No forms yet', 'Create a form with server-side validation and D1 submission storage.')}</div><div data-form-editor></div><div data-form-submissions></div>`;
      document.querySelector('[data-create-form]')?.addEventListener('click', async () => {
        const name = window.prompt('Form name');
        if (!name?.trim() || !sites[0]) return;
        try {
          await cloud.createForm(sites[0].id, name.trim(), [
            { name: 'name', type: 'text', label: 'Name', required: true },
            { name: 'email', type: 'email', label: 'Email', required: true },
            { name: 'message', type: 'textarea', label: 'Message', required: true },
            { name: 'consent', type: 'consent', label: 'I agree to be contacted', required: true },
          ]);
          say('Form created.');
          await renderForms();
        } catch (error) {
          say(error instanceof Error ? error.message : 'Could not create form.');
        }
      });
      document.querySelectorAll<HTMLButtonElement>('[data-edit-form]').forEach((button) =>
        button.addEventListener('click', async () => {
          const form = forms.find((item) => item.id === button.dataset.editForm);
          if (!form) return;
          renderFormEditor(form);
        }),
      );
      const renderFormEditor = (form: FormDefinition & { siteName?: string }) => {
        const target = document.querySelector<HTMLElement>('[data-form-editor]');
        if (!target) return;
        let fields = form.fields.map((field) => ({ ...field }));
        const draw = () => {
          target.innerHTML = `<section class="dashboard-panel form-builder" aria-labelledby="formBuilderTitle"><div class="panel-title"><div><p class="eyebrow">Form builder</p><h2 id="formBuilderTitle">${esc(form.name)}</h2></div><span>${fields.length} fields</span></div><p class="panel-note">Build the form visually. Server-side validation remains authoritative when submissions arrive.</p><div class="form-field-list">${fields.map((field, index) => `<article class="form-field-card" data-form-field="${esc(field.id)}"><div class="form-field-head"><strong>Field ${index + 1}</strong><button class="ghost-btn danger-action" type="button" data-remove-form-field="${esc(field.id)}">Remove</button></div><div class="form-field-grid"><label>Type<select data-field-type>${FORM_FIELD_TYPES.map((type) => `<option value="${type}" ${type === field.type ? 'selected' : ''}>${type.replace('-', ' ')}</option>`).join('')}</select></label><label>Field name<input data-field-name value="${esc(field.name)}" required pattern="[A-Za-z][A-Za-z0-9_-]*" /></label><label class="form-field-wide">Visible label<input data-field-label value="${esc(field.label)}" required /></label><label class="form-field-wide">Options<input data-field-options value="${esc((field.options ?? []).join(', '))}" placeholder="One, Two, Three" /></label><label class="toggle-row form-field-wide"><span>Required</span><input type="checkbox" data-field-required ${field.required ? 'checked' : ''} /></label></div></article>`).join('') || '<p class="empty-state">Add a field to begin.</p>'}</div><div class="form-builder-actions"><button class="ghost-btn" type="button" data-add-form-field>Add field</button><label class="toggle-row"><span>Spam honeypot</span><input type="checkbox" data-form-honeypot ${form.settings.honeypot !== false ? 'checked' : ''} /></label><button class="primary-btn" type="button" data-save-form>Save form</button></div></section>`;
          target.querySelectorAll<HTMLButtonElement>('[data-remove-form-field]').forEach((remove) =>
            remove.addEventListener('click', () => {
              fields = fields.filter((field) => field.id !== remove.dataset.removeFormField);
              draw();
            }),
          );
          target.querySelector('[data-add-form-field]')?.addEventListener('click', () => {
            fields.push({
              id: `field-${Date.now()}`,
              name: `field${fields.length + 1}`,
              type: 'text',
              label: 'New field',
              required: false,
            });
            draw();
          });
          target.querySelector('[data-save-form]')?.addEventListener('click', async () => {
            const nextFields: FormField[] = [];
            let invalid = false;
            target.querySelectorAll<HTMLElement>('[data-form-field]').forEach((card) => {
              const name =
                card.querySelector<HTMLInputElement>('[data-field-name]')?.value.trim() ?? '';
              const label =
                card.querySelector<HTMLInputElement>('[data-field-label]')?.value.trim() ?? '';
              if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name) || !label) invalid = true;
              const type = card.querySelector<HTMLSelectElement>('[data-field-type]')
                ?.value as FormFieldType;
              const options = card
                .querySelector<HTMLInputElement>('[data-field-options]')
                ?.value.split(',')
                .map((item) => item.trim())
                .filter(Boolean);
              nextFields.push({
                id: card.dataset.formField ?? `field-${Date.now()}`,
                name,
                label,
                type,
                required:
                  card.querySelector<HTMLInputElement>('[data-field-required]')?.checked ?? false,
                ...(options?.length ? { options } : {}),
              });
            });
            const validationError = invalid
              ? 'Field labels and names are required.'
              : validateFormFields(nextFields);
            if (validationError) {
              say(validationError);
              return;
            }
            try {
              await cloud.updateForm(form.id, {
                fields: nextFields,
                settings: {
                  ...form.settings,
                  honeypot:
                    target.querySelector<HTMLInputElement>('[data-form-honeypot]')?.checked ?? true,
                },
              });
              say('Form saved.');
              await renderForms();
            } catch (error) {
              say(error instanceof Error ? error.message : 'Could not save the form.');
            }
          });
        };
        draw();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      const renderSubmissionPanel = (formId: string, submissions: FormSubmission[]) => {
        const target = document.querySelector<HTMLElement>('[data-form-submissions]');
        if (!target) return;
        const draw = () => {
          const query =
            document
              .querySelector<HTMLInputElement>('[data-submission-search]')
              ?.value.toLowerCase() ?? '';
          const status =
            document.querySelector<HTMLSelectElement>('[data-submission-status]')?.value ?? '';
          const filtered = submissions.filter((submission) => {
            const matchesStatus = !status || submission.status === status;
            const matchesQuery =
              !query || JSON.stringify(submission.data).toLowerCase().includes(query);
            return matchesStatus && matchesQuery;
          });
          target.querySelector<HTMLElement>('[data-submission-list]')!.innerHTML =
            filtered
              .map(
                (submission) =>
                  `<div class="record-row" data-submission-row="${esc(submission.id)}"><strong>${new Date(submission.createdAt).toLocaleString()}</strong><span class="status-chip ${submission.status === 'archived' ? '' : 'published'}">${esc(submission.status)}</span><small>${esc(Object.keys(submission.data).join(', '))}</small><button class="ghost-btn" type="button" data-submission-read="${esc(submission.id)}">${submission.status === 'read' ? 'Mark received' : 'Mark read'}</button><button class="ghost-btn danger-action" type="button" data-submission-delete="${esc(submission.id)}">Delete</button></div>`,
              )
              .join('') || empty('No matching submissions', 'Try another search or status filter.');
          target.querySelectorAll<HTMLButtonElement>('[data-submission-read]').forEach((action) =>
            action.addEventListener('click', async () => {
              const submission = submissions.find(
                (item) => item.id === action.dataset.submissionRead,
              );
              if (!submission) return;
              const next = submission.status === 'read' ? 'received' : 'read';
              try {
                const updated = await cloud.updateSubmission(formId, submission.id, next);
                Object.assign(submission, updated);
                draw();
              } catch (error) {
                say(error instanceof Error ? error.message : 'Could not update submission.');
              }
            }),
          );
          target.querySelectorAll<HTMLButtonElement>('[data-submission-delete]').forEach((action) =>
            action.addEventListener('click', async () => {
              if (!window.confirm('Delete this submission?')) return;
              try {
                await cloud.deleteSubmission(formId, action.dataset.submissionDelete ?? '');
                const index = submissions.findIndex(
                  (item) => item.id === action.dataset.submissionDelete,
                );
                if (index >= 0) submissions.splice(index, 1);
                draw();
              } catch (error) {
                say(error instanceof Error ? error.message : 'Could not delete submission.');
              }
            }),
          );
        };
        target.innerHTML = `<section class="dashboard-panel collection-records"><div class="panel-title"><h2>Submissions</h2><span>${submissions.length} stored · latest 200</span></div><div class="submission-toolbar"><input type="search" data-submission-search placeholder="Search submissions" aria-label="Search submissions" /><select data-submission-status aria-label="Filter submissions"><option value="">All statuses</option><option value="received">Received</option><option value="read">Read</option><option value="archived">Archived</option></select><button class="ghost-btn" type="button" data-submission-export>Export CSV</button></div><div data-submission-list></div></section>`;
        target.querySelector('[data-submission-search]')?.addEventListener('input', draw);
        target.querySelector('[data-submission-status]')?.addEventListener('change', draw);
        target.querySelector('[data-submission-export]')?.addEventListener('click', async () => {
          try {
            downloadFile(
              'webkiln-submissions.csv',
              await cloud.exportSubmissions(formId),
              'text/csv',
            );
          } catch (error) {
            say(error instanceof Error ? error.message : 'Could not export submissions.');
          }
        });
        draw();
      };
      document.querySelectorAll<HTMLButtonElement>('[data-submissions-form]').forEach((button) =>
        button.addEventListener('click', async () => {
          const target = document.querySelector<HTMLElement>('[data-form-submissions]');
          if (!target) return;
          try {
            const submissions = await cloud.listSubmissions(button.dataset.submissionsForm ?? '');
            renderSubmissionPanel(button.dataset.submissionsForm ?? '', submissions);
          } catch (error) {
            say(error instanceof Error ? error.message : 'Could not load submissions.');
          }
        }),
      );
    } catch (error) {
      view.innerHTML = errorState(error, 'forms');
    }
  };
  const renderAssets = async () => {
    view.innerHTML = loading('Loading asset library');
    if (!selectedWorkspaceId) {
      view.innerHTML = empty('No workspace selected', 'Create a workspace before managing assets.');
      return;
    }
    try {
      const assets = await cloud.listAssets(selectedWorkspaceId);
      duplicateIds = findDuplicateAssetIds(assets);
      const usage = assets.reduce((sum, asset) => sum + asset.size, 0);
      view.innerHTML = `<div class="customer-heading"><div><p class="eyebrow">Workspace / Assets</p><h1>Asset library</h1><p>Organize metadata, usage, and brand context. Binary storage is not configured in this free-tier milestone.</p></div><button class="primary-btn" data-register-asset ${sites[0] ? '' : 'disabled'}>Register metadata</button></div><section class="asset-capability dashboard-panel"><strong>Storage not configured</strong><span>Metadata is available now. Uploads, R2, WebP, AVIF, thumbnails, and responsive transformations remain disabled until an approved storage milestone.</span><b>${formatBytes(usage)} estimated metadata-linked usage · ${assets.length} assets</b></section><div class="asset-toolbar"><input type="search" data-asset-search placeholder="Search filename, tags, or alt text" aria-label="Search assets" /><select data-asset-type aria-label="Filter file type"><option value="">All file types</option><option value="image">Images</option><option value="video">Video</option><option value="application">Documents</option></select><select data-asset-sort aria-label="Sort assets"><option value="updated">Recently updated</option><option value="name">Name</option><option value="size">Largest</option></select></div><div class="asset-manager-grid" data-asset-grid>${assets.map(assetCard).join('') || empty('No asset metadata yet', 'Register an asset reference or keep using the local editor asset system.')}</div>`;
      const reload = () => void renderAssets();
      document.querySelector('[data-register-asset]')?.addEventListener('click', async () => {
        if (!sites[0]) return;
        const filename = window.prompt('Asset filename');
        if (!filename?.trim()) return;
        const mimeType =
          window.prompt(
            'MIME type',
            filename.match(/\.(png|jpe?g|webp|avif)$/i)
              ? 'image/' + filename.split('.').pop()
              : 'application/octet-stream',
          ) ?? 'application/octet-stream';
        const size = Number(window.prompt('Approximate size in bytes', '0') ?? 0);
        try {
          await cloud.createAsset(selectedWorkspaceId, {
            siteId: sites[0].id,
            filename: filename.trim(),
            mimeType,
            size: Number.isFinite(size) ? size : 0,
          });
          say('Asset metadata registered.');
          reload();
        } catch (error) {
          say(error instanceof Error ? error.message : 'Could not register asset.');
        }
      });
      const applyFilters = async () => {
        const query = new URLSearchParams();
        const search = document
          .querySelector<HTMLInputElement>('[data-asset-search]')
          ?.value.trim();
        const type = document.querySelector<HTMLSelectElement>('[data-asset-type]')?.value;
        const sort = document.querySelector<HTMLSelectElement>('[data-asset-sort]')?.value;
        if (search) query.set('q', search);
        if (type) query.set('type', type);
        if (sort) query.set('sort', sort);
        const filtered = await cloud.listAssets(selectedWorkspaceId, query.toString());
        const grid = document.querySelector<HTMLElement>('[data-asset-grid]');
        if (grid)
          grid.innerHTML =
            filtered.map(assetCard).join('') ||
            empty('No matching assets', 'Try a different search or filter.');
        bindAssetActions();
      };
      document
        .querySelector('[data-asset-search]')
        ?.addEventListener('input', () => void applyFilters());
      document
        .querySelector('[data-asset-type]')
        ?.addEventListener('change', () => void applyFilters());
      document
        .querySelector('[data-asset-sort]')
        ?.addEventListener('change', () => void applyFilters());
      bindAssetActions();
    } catch (error) {
      view.innerHTML = errorState(error, 'assets');
    }
  };
  const bindAssetActions = () => {
    document.querySelectorAll<HTMLButtonElement>('[data-asset-save]').forEach((button) =>
      button.addEventListener('click', async () => {
        const card = button.closest<HTMLElement>('[data-asset-card]');
        if (!card) return;
        try {
          await cloud.updateAsset(button.dataset.assetSave ?? '', {
            altText: card.querySelector<HTMLInputElement>('[data-alt]')?.value ?? '',
            caption: card.querySelector<HTMLInputElement>('[data-caption]')?.value ?? '',
            focalPoint: (() => {
              const [x, y] = (
                card.querySelector<HTMLInputElement>('[data-focal]')?.value ?? '50, 50'
              )
                .split(',')
                .map(Number);
              return {
                x: Number.isFinite(x) ? Math.max(0, Math.min(100, x)) : 50,
                y: Number.isFinite(y) ? Math.max(0, Math.min(100, y)) : 50,
              };
            })(),
            folder: card.querySelector<HTMLInputElement>('[data-folder]')?.value ?? '/',
            tags: (card.querySelector<HTMLInputElement>('[data-tags]')?.value ?? '')
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean),
            brandGroup: card.querySelector<HTMLInputElement>('[data-brand]')?.value ?? '',
          });
          say('Asset details saved.');
        } catch (error) {
          say(error instanceof Error ? error.message : 'Could not save asset details.');
        }
      }),
    );
    document.querySelectorAll<HTMLButtonElement>('[data-asset-delete]').forEach((button) =>
      button.addEventListener('click', async () => {
        if (!window.confirm('Delete this unused asset metadata?')) return;
        try {
          await cloud.deleteAsset(button.dataset.assetDelete ?? '');
          say('Asset metadata deleted.');
          void renderAssets();
        } catch (error) {
          say(
            error instanceof Error
              ? error.message
              : 'Asset is still in use or could not be deleted.',
          );
        }
      }),
    );
  };
  const assetCard = (asset: AssetMetadata) =>
    `<article class="dashboard-panel asset-manager-card" data-asset-card><div class="asset-manager-thumb"><span>${asset.mimeType.startsWith('image/') ? '▧' : '▤'}</span><small>${esc(asset.mimeType)}${duplicateIds.has(asset.id) ? ' · Duplicate hash' : ''}</small></div><div class="asset-manager-body"><h2>${esc(asset.filename)}</h2><small>${formatBytes(asset.size)} · ${asset.usageCount ? `${asset.usageCount} usages` : 'Unused'} · ${esc(asset.storageStatus)}</small><label>Alt text<input data-alt value="${esc(asset.altText)}" placeholder="Describe the asset" /></label><label>Caption<input data-caption value="${esc(asset.caption)}" /></label><label>Focal point<input data-focal value="${asset.focalPoint.x}, ${asset.focalPoint.y}" placeholder="50, 50" /></label><label>Folder<input data-folder value="${esc(asset.folder)}" /></label><label>Tags<input data-tags value="${esc(asset.tags.join(', '))}" placeholder="brand, hero" /></label><label>Brand group<input data-brand value="${esc(asset.brandGroup ?? '')}" placeholder="Optional" /></label><div class="website-actions"><button class="primary-btn" data-asset-save="${asset.id}">Save details</button><button class="ghost-btn danger-action" data-asset-delete="${asset.id}" ${asset.usageCount ? 'disabled title="Replace usages before deleting"' : ''}>${asset.usageCount ? 'In use' : 'Delete'}</button></div></div></article>`;
  const renderTeam = async () => {
    if (!selectedWorkspaceId) return;
    view.innerHTML = loading('Loading workspace members');
    try {
      const result = await cloud.listMembers(selectedWorkspaceId);
      view.innerHTML = `<div class="customer-heading"><div><p class="eyebrow">Workspace / Team</p><h1>People and permissions</h1><p>Roles are enforced by the Worker. Invitation email delivery is not connected; copy the secure invitation link instead.</p></div><button class="primary-btn" data-invite-member>Invite member</button></div><section class="dashboard-panel team-panel"><div class="panel-title"><h2>Members</h2><span>${result.members.length} active</span></div>${result.members.map((member) => `<div class="team-row"><div><strong>${esc(member.userId)}</strong><small>${member.invitationStatus}</small></div><select data-member-role="${member.id}">${['administrator', 'designer', 'content_editor', 'reviewer', 'viewer'].map((role) => `<option value="${role}" ${role === member.role ? 'selected' : ''}>${role.replace('_', ' ')}</option>`).join('')}</select><button class="ghost-btn danger-action" data-remove-member="${member.id}" ${member.role === 'owner' ? 'disabled' : ''}>Remove</button></div>`).join('')}</section><section class="dashboard-panel team-panel"><div class="panel-title"><h2>Pending invitations</h2><span>Email provider unavailable</span></div>${result.invitations.map((invite) => `<div class="team-row"><div><strong>${esc(invite.email)}</strong><small>${invite.role} · expires ${new Date(invite.expiresAt).toLocaleDateString()}</small></div><button class="ghost-btn" data-copy-invite="${esc(invite.inviteUrl ?? '')}">Copy link</button></div>`).join('') || empty('No pending invitations', 'Invite a collaborator when you are ready.')}</section>`;
      document.querySelector('[data-invite-member]')?.addEventListener('click', async () => {
        const email = window.prompt('Collaborator email');
        if (!email) return;
        const role =
          window.prompt(
            'Role: administrator, designer, content_editor, reviewer, or viewer',
            'reviewer',
          ) ?? 'reviewer';
        try {
          const invite = await cloud.inviteMember(selectedWorkspaceId, email, role);
          await navigator.clipboard?.writeText(invite.inviteUrl ?? '');
          say('Invitation link copied. Email delivery is not connected.');
          void renderTeam();
        } catch (error) {
          say(error instanceof Error ? error.message : 'Could not create invitation.');
        }
      });
      document.querySelectorAll<HTMLSelectElement>('[data-member-role]').forEach((select) =>
        select.addEventListener('change', async () => {
          try {
            await cloud.updateMemberRole(
              selectedWorkspaceId,
              select.dataset.memberRole ?? '',
              select.value,
            );
            say('Role updated.');
          } catch (error) {
            say(error instanceof Error ? error.message : 'Could not update role.');
            void renderTeam();
          }
        }),
      );
      document.querySelectorAll<HTMLButtonElement>('[data-remove-member]').forEach((button) =>
        button.addEventListener('click', async () => {
          if (!window.confirm('Remove this member?')) return;
          try {
            await cloud.removeMember(selectedWorkspaceId, button.dataset.removeMember ?? '');
            say('Member removed.');
            void renderTeam();
          } catch (error) {
            say(error instanceof Error ? error.message : 'Could not remove member.');
          }
        }),
      );
      document.querySelectorAll<HTMLButtonElement>('[data-copy-invite]').forEach((button) =>
        button.addEventListener('click', async () => {
          await navigator.clipboard?.writeText(button.dataset.copyInvite ?? '');
          say('Invitation link copied.');
        }),
      );
    } catch (error) {
      view.innerHTML = errorState(error, 'team');
    }
  };
  const renderUnavailable = (section: Section) => {
    const details: Record<string, [string, string]> = {
      domains: [
        'Domains',
        'Connect a custom domain when you are ready. Domain provisioning is intentionally kept behind the approved provider boundary.',
      ],
      forms: [
        'Form submissions',
        'Review stored submissions from your published forms. File uploads and email delivery remain intentionally unavailable.',
      ],
      assets: [
        'Asset library',
        'Asset metadata is available from the Assets section. Binary storage remains intentionally unconfigured.',
      ],
      billing: [
        'Billing',
        'Billing is disabled. WebKiln’s current testing environment does not collect payments or request a payment method.',
      ],
      team: [
        'Team members',
        'Manage workspace roles, protected invitations, and member access from the collaboration controls.',
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
    return `<article class="website-card"><div class="website-thumbnail"><span>W</span><small>${site.published ? 'LIVE' : 'DRAFT'}</small></div><div class="website-card-body"><div class="website-card-head"><div><h2>${esc(site.name)}</h2><p class="website-url">${site.customDomain ? esc(site.customDomain) : publicUrl}</p></div><details class="site-actions"><summary aria-label="Actions for ${esc(site.name)}">•••</summary><div class="site-actions-menu"><button type="button" data-action="rename" data-site="${site.id}">Rename</button><button type="button" data-action="duplicate" data-site="${site.id}">Duplicate</button><button type="button" data-action="export" data-site="${site.id}">Export static site</button><button type="button" data-action="backup" data-site="${site.id}">Download backup</button><button type="button" data-action="domain" data-site="${site.id}">Connect domain</button><button type="button" data-action="archive" data-site="${site.id}">${site.status === 'archived' ? 'Restore website' : 'Archive website'}</button>${site.status === 'archived' ? `<button type="button" data-action="delete" data-site="${site.id}" class="danger-action">Delete permanently</button>` : ''}</div></details></div><div class="website-meta"><span class="status-chip ${site.published ? 'published' : ''}">${site.published ? 'Published' : 'Draft'}</span><span>Edited ${new Date(site.updatedAt).toLocaleDateString()}</span><span>Revision ${site.currentRevision}</span><span class="deployment-status">${site.published ? 'Deployment live' : 'Not deployed'}</span></div><div class="website-actions"><button class="primary-btn" data-action="edit" data-site="${site.id}">Open editor</button><button class="ghost-btn" data-action="preview" data-site="${site.id}">Preview draft</button>${site.published ? `<a class="text-button" href="${publicUrl}" target="_blank" rel="noreferrer">View published</a>` : ''}</div></div></article>`;
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
    document
      .querySelector('[data-create-site]')
      ?.addEventListener('click', () => navigate('/onboarding'));
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
      else if (action === 'export' || action === 'backup') {
        const remote = await cloud.getProject(siteId);
        if (action === 'backup')
          downloadFile(
            `${site.slug}-webkiln-backup.json`,
            JSON.stringify(createProjectBackup(remote.project), null, 2),
            'application/json',
          );
        else
          createStaticExport(remote.project).forEach((file) =>
            downloadFile(
              file.path.replace(/\//g, '-'),
              file.content,
              file.contentType === 'css'
                ? 'text/css'
                : file.contentType === 'html'
                  ? 'text/html'
                  : 'application/octet-stream',
            ),
          );
        say(action === 'backup' ? 'Backup downloaded.' : 'Static export downloaded.');
      } else if (action === 'rename') {
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
  const downloadFile = (name: string, content: string, type: string) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type }));
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const empty = (title: string, copy: string) =>
    `<div class="empty-state dashboard-empty"><strong>${title}</strong><small>${copy}</small></div>`;
  const loading = (text: string) => `<div class="cloud-loading">${text}…</div>`;
  const errorState = (error: unknown, section: Section) =>
    `<div class="error-state">${esc(error instanceof Error ? error.message : 'Could not load this area.')} <button type="button" data-nav="${section}">Retry</button></div>`;
  const navIcon = (section: string) =>
    ({
      overview: '◌',
      analytics: '⌁',
      websites: '◈',
      collections: '{}',
      automations: '↯',
      templates: '✦',
      domains: '⌁',
      forms: '▤',
      assets: '▧',
      billing: '◒',
      team: '◎',
      account: '⚙',
    })[section] ?? '•';
  const sectionLabel = (section: string) => section.charAt(0).toUpperCase() + section.slice(1);
  const formatBytes = (bytes: number) =>
    bytes < 1024
      ? `${bytes} B`
      : bytes < 1024 ** 2
        ? `${(bytes / 1024).toFixed(1)} KB`
        : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
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
    selectedWorkspaceId = workspaces.some((workspace) => workspace.id === initialWorkspaceId)
      ? initialWorkspaceId
      : (workspaces[0]?.id ?? '');
    if (selectedWorkspaceId) sites = await cloud.listSites(selectedWorkspaceId);
    renderSection(
      (sections.includes(initialSection as Section) ? initialSection : 'overview') as Section,
    );
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
