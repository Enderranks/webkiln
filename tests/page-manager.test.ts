import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../src/models/project-schema';
import { duplicatePage, newPage, removePage, restorePage, setHomepage, uniqueSlug } from '../src/models/page-manager';

describe('page manager', () => {
  it('creates unique slugs and duplicates page data', () => {
    const project = createEmptyProject();
    const home = { ...newPage(project, 'Home'), id: 'home', slug: '/' };
    project.pages.push(home);
    const page = newPage(project, 'About us'); page.projectData = { components: '<h1>About</h1>' }; project.pages.push(page);
    expect(uniqueSlug(project, 'About us')).toBe('/about-us-2');
    const copy = duplicatePage(project, page);
    expect(copy.slug).toBe('/about-us-copy');
    expect(copy.projectData).toEqual(page.projectData);
  });

  it('protects a homepage and restores deleted pages', () => {
    const project = createEmptyProject();
    const home = { ...newPage(project, 'Home'), id: 'home', slug: '/' };
    const about = newPage(project, 'About'); project.pages.push(home, about); setHomepage(project, 'home');
    expect(removePage(project, 'home')?.id).toBe('home');
    expect(project.homepagePageId).toBe(about.id);
    expect(restorePage(project, 'home')?.name).toBe('Home');
  });
});
