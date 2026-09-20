import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../src/models/project-schema';
import {
  createProjectBackup,
  createSitemap,
  extractPageHtml,
  importStaticHtml,
  parseProjectBackup,
  recordsToCsv,
} from '../src/portability/export';
import { migrateComponentPackage, validateComponentPackage } from '../src/components-sdk/sdk';

describe('v21 portability and component SDK', () => {
  it('exports clean markup and strips editor/unsafe content', () => {
    const project = createEmptyProject();
    project.pages = [
      {
        id: 'home',
        name: 'Home',
        slug: '/',
        projectData: {
          components:
            '<section data-gjs-type="wrapper" onclick="bad()"><h1>Hi</h1><script>alert(1)</script></section>',
        },
        updatedAt: '',
        isHomepage: true,
        seo: { title: 'Home', description: 'Desc' },
        settings: { showInNavigation: true, passwordProtected: false },
      },
    ];
    const html = extractPageHtml(project.pages[0]);
    expect(html).toContain('<h1>Hi</h1>');
    expect(html).not.toContain('script');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('data-gjs');
  });
  it('round-trips a scrubbed backup and generates a sitemap/CSV', () => {
    const backup = parseProjectBackup(createProjectBackup(createEmptyProject()));
    expect(backup.project.site.id).toBe('portable-site');
    expect(createSitemap(backup.project, 'https://example.test').content).toContain('<urlset');
    expect(recordsToCsv([{ id: '1', data: { title: 'Hello, world' } } as never])).toContain(
      '"Hello, world"',
    );
  });
  it('imports static HTML with explicit limitations', () => {
    const result = importStaticHtml('<html><body><main><h1>Imported</h1></main></body></html>');
    expect(result.project.pages[0].projectData).toEqual({
      components: '<main><h1>Imported</h1></main>',
    });
    expect(result.limitations.length).toBeGreaterThan(0);
    expect(() => importStaticHtml('<body><script>bad()</script></body>')).toThrow();
  });
  it('validates packages and rejects executable content', () => {
    const pkg = {
      sdkVersion: 1 as const,
      manifest: {
        id: 'hero-card',
        version: 1,
        displayName: 'Hero card',
        editableFields: [{ name: 'title', type: 'text' as const }],
        traits: [],
        allowedParents: ['section'],
        allowedChildren: [],
        responsive: true,
        accessibility: { keyboard: true },
        inspector: [],
        defaultStyles: {},
      },
      markup: '<article><h2>Title</h2></article>',
      styles: '.hero{color:red}',
    };
    expect(validateComponentPackage(pkg)).toBe(true);
    expect(validateComponentPackage({ ...pkg, markup: '<script>bad()</script>' })).toBe(false);
    expect(migrateComponentPackage(pkg, 2).manifest.version).toBe(2);
  });
});
