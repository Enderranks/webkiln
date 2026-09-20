import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../src/models/project-schema';
import {
  duplicatePage,
  newPage,
  removePage,
  restorePage,
  setPageFolder,
  setPageParent,
  setHomepage,
  uniqueSlug,
} from '../src/models/page-manager';

describe('page manager', () => {
  it('creates unique slugs and duplicates page data', () => {
    const project = createEmptyProject();
    const home = { ...newPage(project, 'Home'), id: 'home', slug: '/' };
    project.pages.push(home);
    const page = newPage(project, 'About us');
    page.projectData = { components: '<h1>About</h1>' };
    project.pages.push(page);
    expect(uniqueSlug(project, 'About us')).toBe('/about-us-2');
    const copy = duplicatePage(project, page);
    expect(copy.slug).toBe('/about-us-copy');
    expect(copy.projectData).toEqual(page.projectData);
  });

  it('protects a homepage and restores deleted pages', () => {
    const project = createEmptyProject();
    const home = { ...newPage(project, 'Home'), id: 'home', slug: '/' };
    const about = newPage(project, 'About');
    project.pages.push(home, about);
    setHomepage(project, 'home');
    expect(removePage(project, 'home')?.id).toBe('home');
    expect(project.homepagePageId).toBe(about.id);
    expect(restorePage(project, 'home')?.name).toBe('Home');
  });

  it('supports folders and parent pages without cycles', () => {
    const project = createEmptyProject();
    const home = { ...newPage(project, 'Home'), id: 'home', slug: '/' };
    const about = { ...newPage(project, 'About'), id: 'about' };
    const team = { ...newPage(project, 'Team'), id: 'team' };
    project.pages.push(home, about, team);
    expect(setPageParent(project, 'about', 'home')).toBe(true);
    expect(setPageParent(project, 'team', 'about')).toBe(true);
    expect(setPageParent(project, 'home', 'team')).toBe(false);
    expect(setPageFolder(project, 'team', 'company')).toBe(true);
    expect(team.folder).toBe('company');
    expect(setPageParent(project, 'team', null)).toBe(true);
    expect(team.parentId).toBeUndefined();
  });
});
