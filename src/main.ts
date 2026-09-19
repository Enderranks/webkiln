import { GrapesJSEditorAdapter } from './editor';
import { WebKilnEditorController } from './editor/webkiln-controller';
import { LocalProjectStorage } from './storage/project-storage';
import type { WebKilnProject } from './types';
import { WebKilnApiClient } from './cloud/api-client';

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLElement>('#siteCanvas');
  if (!canvas) throw new Error('WebKiln canvas was not found');

  const storage = new LocalProjectStorage();
  const project = storage.load();
  const adapter = new GrapesJSEditorAdapter(canvas);
  const cloud = new WebKilnApiClient();
  window.WebKiln = {
    ...(window.WebKiln ?? {}),
    adapter,
    project,
    storage,
    cloud,
    cloudConfigured: cloud.configured,
  };
  window.WebKiln.recoverLegacy = () => storage.restoreLatestLegacy();

  try {
    await adapter.initialize();
    ensurePages(project, adapter.exportProjectData());
    const currentPage = project.pages.find((page) => page.id === project.currentPageId);
    if (currentPage?.projectData) adapter.loadProjectData(currentPage.projectData);
    new WebKilnEditorController(adapter, project, storage).start();
    renderCloudStatus(cloud.configured);
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

function renderCloudStatus(configured: boolean): void {
  const panel = document.querySelector('#sitePanel');
  if (!panel || panel.querySelector('[data-cloud-status]')) return;
  const card = document.createElement('div');
  card.dataset.cloudStatus = 'true';
  card.className = 'recovery-card cloud-status-card';
  card.innerHTML = configured
    ? '<strong>Cloud workspace ready</strong><small>Authentication and project sync are provided by the configured backend.</small>'
    : '<strong>Local-only mode</strong><small>No secure WebKiln backend is configured for this deployment. Projects remain in this browser until a backend is connected.</small>';
  panel.append(card);
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
