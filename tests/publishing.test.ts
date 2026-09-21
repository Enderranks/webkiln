import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../src/models/project-schema';
import {
  createPublishedSnapshot,
  extractProjectMarkup,
  publicHtml,
  publicRobots,
} from '../worker/src/publishing';

describe('published site snapshots', () => {
  it('strips scripts, handlers, javascript URLs, and editor attributes', () => {
    const markup = extractProjectMarkup({
      components:
        '<section data-gjs-type="wrapper" onclick="bad()"><script>bad()</script><a href="javascript:bad()">Link</a></section>',
      styles: '@import url(https://bad.test); body{behavior:url(x)}',
    });
    expect(markup.html).not.toMatch(/script|onclick|javascript:|data-gjs/i);
    expect(markup.css).not.toMatch(/@import|behavior/i);
  });

  it('creates ordered navigation, SEO metadata, and a custom 404 snapshot', () => {
    const project = createEmptyProject();
    project.site.title = 'Public WebKiln';
    project.site.description = 'A published site';
    project.pages = [
      {
        id: 'home',
        name: 'Home',
        slug: '/',
        projectData: { components: '<h1>Home</h1>' },
        updatedAt: '',
        isHomepage: true,
        seo: { title: 'Home title', description: 'Home description' },
        settings: { showInNavigation: true, passwordProtected: false },
      },
      {
        id: 'hidden',
        name: 'Hidden',
        slug: '/hidden',
        projectData: { components: '<p>Hidden</p>' },
        updatedAt: '',
        seo: { title: 'Hidden', description: '' },
        settings: { showInNavigation: false, passwordProtected: false },
      },
      {
        id: '404',
        name: 'Not found',
        slug: '/404',
        projectData: { components: '<h1>Custom 404</h1>' },
        updatedAt: '',
        seo: { title: 'Not found', description: '' },
        settings: { showInNavigation: false, passwordProtected: false },
      },
    ];
    const snapshot = createPublishedSnapshot(project, 'now');
    const html = publicHtml(snapshot, snapshot.pages[0], '/sites/public');
    expect(snapshot.custom404?.name).toBe('Not found');
    expect(html).toContain('Home description');
    expect(html).not.toContain('Hidden</a>');
    expect(html).not.toContain('Hidden</a>');
  });

  it('preserves parent pages in public navigation', () => {
    const project = createEmptyProject();
    project.pages = [
      {
        id: 'home',
        name: 'Home',
        slug: '/',
        projectData: { components: '<h1>Home</h1>' },
        updatedAt: '',
        isHomepage: true,
        seo: { title: 'Home', description: '' },
        settings: { showInNavigation: true, passwordProtected: false },
      },
      {
        id: 'child',
        name: 'Child',
        slug: '/child',
        parentId: 'home',
        projectData: { components: '<h1>Child</h1>' },
        updatedAt: '',
        seo: { title: 'Child', description: '' },
        settings: { showInNavigation: true, passwordProtected: false },
      },
    ];
    const snapshot = createPublishedSnapshot(project);
    expect(snapshot.pages.find((page) => page.id === 'child')?.parentId).toBe('home');
    expect(publicHtml(snapshot, snapshot.pages[0], 'https://example.test')).toContain('<ul>');
  });
  it('publishes an explicit safe menu without exposing editor metadata', () => {
    const project = createEmptyProject();
    project.pages = [
      {
        id: 'home',
        name: 'Home',
        slug: '/',
        projectData: { components: '<h1>Home</h1>' },
        updatedAt: '',
        isHomepage: true,
        seo: { title: 'Home', description: '' },
        settings: { showInNavigation: true, passwordProtected: false },
      },
    ];
    project.editorSettings!.menus = [
      {
        id: 'main',
        name: 'Main',
        mobileMode: 'drawer',
        items: [
          {
            id: 'docs',
            label: 'Docs',
            type: 'external',
            target: 'https://docs.example.test',
            children: [],
          },
          {
            id: 'bad',
            label: 'Bad',
            type: 'external',
            target: 'javascript:alert(1)',
            children: [],
          },
        ],
      },
    ];
    const snapshot = createPublishedSnapshot(project);
    const html = publicHtml(snapshot, snapshot.pages[0], 'https://example.test');
    expect(html).toContain('https://docs.example.test');
    expect(html).not.toContain('javascript:');
  });
  it('renders drawer navigation as a native accessible disclosure', () => {
    const project = createEmptyProject();
    project.pages = [
      {
        id: 'home',
        name: 'Home',
        slug: '/',
        projectData: { components: '<h1>Home</h1>' },
        updatedAt: '',
        isHomepage: true,
        seo: { title: 'Home', description: '' },
        settings: { showInNavigation: true, passwordProtected: false },
      },
    ];
    project.editorSettings!.menus = [
      {
        id: 'main',
        name: 'Main',
        mobileMode: 'drawer',
        items: [
          { id: 'home', label: 'Home', type: 'page', pageId: project.pages[0].id, children: [] },
        ],
      },
    ];
    const snapshot = createPublishedSnapshot(project);
    const html = publicHtml(snapshot, snapshot.pages[0], 'https://example.test');
    expect(html).toContain('<details class="wk-nav-drawer">');
    expect(html).not.toContain('<script');
  });

  it('generates robots controls from the published homepage SEO setting', () => {
    const project = createEmptyProject();
    project.pages = [
      {
        id: 'home',
        name: 'Home',
        slug: '/',
        projectData: { components: '<h1>Home</h1>' },
        updatedAt: '',
        isHomepage: true,
        seo: { title: 'Home', description: '', robots: 'noindex,nofollow' },
      },
    ];
    const snapshot = createPublishedSnapshot(project);
    const robots = publicRobots(snapshot, 'https://example.test/sites/demo');
    expect(robots).toContain('Disallow: /');
    expect(robots).toContain('Sitemap: https://example.test/sites/demo/sitemap.xml');
  });

  it('publishes only allowlisted interactions through the fixed runtime contract', () => {
    const project = createEmptyProject();
    project.pages = [
      {
        id: 'home',
        name: 'Home',
        slug: '/',
        projectData: {
          components:
            '<button data-wk-id="hero-cta">Start</button><div data-wk-id="panel">Panel</div>',
        },
        updatedAt: '',
        isHomepage: true,
        seo: { title: 'Home', description: '' },
        settings: { showInNavigation: true, passwordProtected: false },
      },
    ];
    project.editorSettings!.interactions = [
      {
        id: 'interaction-1',
        name: 'Reveal panel',
        trigger: 'click',
        target: '[data-wk-id="hero-cta"]',
        actions: [
          {
            id: 'action-1',
            type: 'show',
            target: '[data-wk-id="panel"]',
            duration: 200,
            delay: 0,
            easing: 'ease-out',
          },
          {
            id: 'unsafe-action',
            type: 'counter',
            target: '[data-wk-id="panel"]',
            duration: 200,
            delay: 0,
            easing: 'ease-out',
          },
        ],
        sequence: 'sequence',
        loop: { enabled: false, delay: 0 },
        enabled: true,
      },
    ];
    const snapshot = createPublishedSnapshot(project);
    const html = publicHtml(snapshot, snapshot.pages[0], 'https://example.test/sites/demo');
    expect(snapshot.interactions).toHaveLength(1);
    expect(snapshot.interactions?.[0].actions).toHaveLength(1);
    expect(html).toContain('webkiln-interactions');
    expect(html).toContain('/webkiln-runtime.js');
    expect(html).toContain('data-webkiln-id="hero-cta"');
    expect(html).not.toContain('data-wk-id');
  });

  it('publishes only site-owned form bindings and adds the safe submission runtime', () => {
    const markup = extractProjectMarkup(
      {
        components:
          '<section><form data-wk-form-id="form-good"><label>Email<input name="email" type="email"></label><button type="submit">Send</button></form><form data-wk-form-id="form-other"><input name="x"></form><form><input name="ignored"></form></section>',
      },
      new Set(['form-good']),
    );
    expect(markup.html).toContain('data-webkiln-form-id="form-good"');
    expect(markup.html).toContain('action="/api/forms/form-good/submit"');
    expect(markup.html).not.toContain('form-other');
    expect(markup.html).toContain('form is not connected');
    const project = createEmptyProject();
    project.pages = [
      {
        id: 'home',
        name: 'Home',
        slug: '/',
        projectData: {
          components:
            '<form data-wk-form-id="form-good"><input name="email"><button type="submit">Send</button></form>',
        },
        updatedAt: '',
        isHomepage: true,
      },
    ];
    project.homepagePageId = 'home';
    project.currentPageId = 'home';
    const snapshot = createPublishedSnapshot(project, 'now', new Set(['form-good']));
    const html = publicHtml(snapshot, snapshot.pages[0], 'https://example.test/sites/demo');
    expect(html).toContain('/webkiln-runtime.js');
  });
});
