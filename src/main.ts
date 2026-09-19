import { GrapesJSEditorAdapter } from './editor';
import { WebKilnEditorController } from './editor/webkiln-controller';
import { LocalProjectStorage } from './storage/project-storage';
import type { WebKilnProject } from './types';
import { WebKilnApiClient } from './cloud/api-client';
import { CloudProjectAdapter } from './cloud/cloud-project-adapter';

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLElement>('#siteCanvas');
  if (!canvas) throw new Error('WebKiln canvas was not found');

  const storage = new LocalProjectStorage();
  const project = storage.load();
  const adapter = new GrapesJSEditorAdapter(canvas);
  const cloud = new WebKilnApiClient();
  const cloudProject = new CloudProjectAdapter(cloud);
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
    new WebKilnEditorController(adapter, project, storage).start();
    renderCloudStatus(cloud);
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

function renderCloudStatus(cloud: WebKilnApiClient): void {
  const panel = document.querySelector('#sitePanel');
  if (!panel || panel.querySelector('[data-cloud-status]')) return;
  const card = document.createElement('div');
  card.dataset.cloudStatus = 'true';
  card.className = 'recovery-card cloud-status-card';
  card.innerHTML = `
    <strong>${cloud.configured ? 'Cloud workspace' : 'Local-only mode'}</strong>
    <small>${cloud.configured ? 'Sign in to sync projects with the WebKiln backend.' : 'No secure WebKiln backend is configured. Projects remain in this browser.'}</small>
    ${
      cloud.configured
        ? `
      <form data-cloud-auth-form>
        <label>Name <input name="name" autocomplete="name" placeholder="Your name" /></label>
        <label>Email <input name="email" type="email" autocomplete="email" required /></label>
        <label>Password <input name="password" type="password" autocomplete="current-password" minlength="8" required /></label>
        <div><button type="submit" data-auth-action="signin">Sign in</button><button type="button" data-auth-action="signup">Create account</button><button type="button" data-auth-action="signout" hidden>Sign out</button></div>
        <small data-auth-message aria-live="polite"></small>
      </form>`
        : ''
    }`;
  panel.append(card);
  if (!cloud.configured) return;
  const form = card.querySelector<HTMLFormElement>('[data-cloud-auth-form]');
  const message = card.querySelector<HTMLElement>('[data-auth-message]');
  const signIn = card.querySelector<HTMLButtonElement>('[data-auth-action="signin"]');
  const signUp = card.querySelector<HTMLButtonElement>('[data-auth-action="signup"]');
  const signOut = card.querySelector<HTMLButtonElement>('[data-auth-action="signout"]');
  const name = form?.elements.namedItem('name') as HTMLInputElement | null;
  const email = form?.elements.namedItem('email') as HTMLInputElement | null;
  const password = form?.elements.namedItem('password') as HTMLInputElement | null;
  const setMessage = (text: string) => {
    if (message) message.textContent = text;
  };
  const setSignedIn = (signedIn: boolean, displayName?: string) => {
    if (signIn) signIn.hidden = signedIn;
    if (signUp) signUp.hidden = signedIn;
    if (signOut) signOut.hidden = !signedIn;
    if (name) name.hidden = signedIn;
    if (signedIn) setMessage(`Signed in${displayName ? ` as ${displayName}` : ''}.`);
  };
  void cloud
    .getSession()
    .then((session) => setSignedIn(Boolean(session), session?.user.displayName));
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const session = await cloud.signIn(email?.value ?? '', password?.value ?? '');
      setSignedIn(true, session.user.displayName);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign in failed');
    }
  });
  signUp?.addEventListener('click', async () => {
    try {
      const session = await cloud.signUp(
        name?.value ?? '',
        email?.value ?? '',
        password?.value ?? '',
      );
      setSignedIn(true, session.user.displayName);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Account creation failed');
    }
  });
  signOut?.addEventListener('click', async () => {
    try {
      await cloud.signOut();
      setSignedIn(false);
      setMessage('Signed out.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign out failed');
    }
  });
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
