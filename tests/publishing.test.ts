import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../src/models/project-schema';
import {
  createPublishedSnapshot,
  extractProjectMarkup,
  publicHtml,
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
});
