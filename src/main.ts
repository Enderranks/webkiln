import { GrapesJSEditorAdapter } from './editor';
import { WebKilnEditorController } from './editor/webkiln-controller';
import { LocalProjectStorage } from './storage/project-storage';
import type { WebKilnProject } from './types';

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLElement>('#siteCanvas');
  if (!canvas) throw new Error('WebKiln canvas was not found');

  const storage = new LocalProjectStorage();
  const project = storage.load();
  const adapter = new GrapesJSEditorAdapter(canvas);
  window.WebKiln = { ...(window.WebKiln ?? {}), adapter, project, storage };
  window.WebKiln.recoverLegacy = () => storage.restoreLatestLegacy();

  try {
    await adapter.initialize();
    ensurePages(project, adapter.exportProjectData());
    const currentPage = project.pages.find((page) => page.id === project.currentPageId);
    if (currentPage?.projectData) adapter.loadProjectData(currentPage.projectData);
    new WebKilnEditorController(adapter, project, storage).start();
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

function ensurePages(project: WebKilnProject, initialData: unknown): void {
  if (project.pages.length) return;
  project.pages = [
    {
      id: 'home',
      name: 'Home',
      slug: '/',
      projectData: initialData,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'game-hosting',
      name: 'Game Hosting',
      slug: '/game-hosting',
      projectData: null,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'support',
      name: 'Support',
      slug: '/support',
      projectData: null,
      updatedAt: new Date().toISOString(),
    },
  ];
  project.currentPageId = 'home';
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', () => void boot());
else void boot();
