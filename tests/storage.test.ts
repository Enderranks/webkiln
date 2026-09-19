/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalProjectStorage } from '../src/storage/project-storage';

describe('local project storage', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips structured pages and preserves a legacy backup', () => {
    const storage = new LocalProjectStorage('test-project');
    const project = storage.load();
    project.pages.push({
      id: 'home',
      name: 'Home',
      slug: '/',
      projectData: { components: [] },
      updatedAt: new Date().toISOString(),
    });
    storage.save(project);
    storage.backupLegacy('webkiln-page', '<section>legacy</section>');
    expect(storage.load().pages[0].name).toBe('Home');
    expect(localStorage.getItem('test-project:legacy:webkiln-page')).toContain('legacy');
  });

  it('migrates the previous WebKiln page store into independent page records', () => {
    localStorage.setItem(
      'webkiln-pages',
      JSON.stringify({ Home: '<section>home</section>', Support: '<section>support</section>' }),
    );
    const project = new LocalProjectStorage().load();
    expect(project.pages).toHaveLength(2);
    expect(project.pages[1].projectData).toMatchObject({
      components: '<section>support</section>',
    });
    expect(localStorage.getItem('webkiln-project-v2:legacy:webkiln-pages')).toContain('Support');
  });
});
