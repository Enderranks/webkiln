import './legacy/app.js';
import './legacy/rebuild.js';
import { GrapesJSEditorAdapter } from './editor';
import { LocalProjectStorage } from './storage/project-storage';
import type { DeviceId, WebKilnProject } from './types';

const devices: DeviceId[] = ['desktop', 'tablet', 'mobile'];

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLElement>('#siteCanvas');
  if (!canvas) throw new Error('WebKiln canvas was not found');

  const storage = new LocalProjectStorage();
  const project = storage.load();
  const adapter = new GrapesJSEditorAdapter(canvas);
  window.WebKiln = { ...(window.WebKiln ?? {}), adapter, project, storage };

  try {
    await adapter.initialize();
    const currentPage = project.pages.find((page) => page.id === project.currentPageId);
    if (!currentPage) {
      project.pages.push({
        id: 'home',
        name: 'Home',
        slug: '/',
        projectData: adapter.exportProjectData(),
        updatedAt: new Date().toISOString(),
      });
      project.currentPageId = 'home';
    }
    saveStructuredProject(project, adapter, storage);
    wireEngineCommands(adapter, project, storage);
    document.documentElement.dataset.editorEngine = 'grapesjs';
    document
      .querySelector('#saveState')
      ?.replaceChildren(document.createTextNode('✓ Saved · GrapesJS'));
  } catch (error) {
    document.documentElement.dataset.editorEngine = 'native-fallback';
    window.toastMessage?.(
      'Editor engine fallback',
      'The native canvas is still available while GrapesJS reconnects.',
    );
    console.error(error);
  }
}

function saveStructuredProject(
  project: WebKilnProject,
  adapter: GrapesJSEditorAdapter,
  storage: LocalProjectStorage,
): void {
  const page = project.pages.find((item) => item.id === project.currentPageId);
  if (page) {
    page.projectData = adapter.exportProjectData();
    page.updatedAt = new Date().toISOString();
  }
  storage.save(project);
}

function wireEngineCommands(
  adapter: GrapesJSEditorAdapter,
  project: WebKilnProject,
  storage: LocalProjectStorage,
): void {
  const undo = document.querySelector('#undoBtn');
  const redo = document.querySelector('#redoBtn');
  undo?.addEventListener('click', () => adapter.undo());
  redo?.addEventListener('click', () => adapter.redo());
  document.querySelectorAll<HTMLButtonElement>('.device').forEach((button) =>
    button.addEventListener('click', () => {
      const device = button.dataset.width as DeviceId;
      if (devices.includes(device)) adapter.setDevice(device);
    }),
  );
  let saveTimer: number | undefined;
  const persist = () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveStructuredProject(project, adapter, storage), 450);
  };
  adapter.subscribe('update', persist);
  adapter.subscribe('select', () => {
    document
      .querySelector('#selectionStatus')
      ?.replaceChildren(document.createTextNode('GrapesJS component selected'));
  });
  document.querySelector('#publishBtn')?.addEventListener('click', () => {
    saveStructuredProject(project, adapter, storage);
    window.toastMessage?.(
      'Project snapshot saved',
      'Structured GrapesJS data is ready for publishing.',
    );
  });
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', () => void boot());
else void boot();
