import type { WebKilnProject } from '../types';
import { createEmptyProject, migrateProject } from '../models/project-schema';

export interface ProjectStorage {
  load(): WebKilnProject;
  save(project: WebKilnProject): void;
  backupLegacy(key: string, value: string): void;
  restoreLatestLegacy(): WebKilnProject | null;
}

export class LocalProjectStorage implements ProjectStorage {
  constructor(private readonly key = 'webkiln-project-v2') {}

  load(): WebKilnProject {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) return migrateProject(JSON.parse(raw));
      const migrated = this.loadLegacyProject();
      if (migrated) return migrated;
      return createEmptyProject();
    } catch {
      const raw = localStorage.getItem(this.key);
      if (raw) this.backupLegacy('corrupt-project', raw);
      return createEmptyProject();
    }
  }

  save(project: WebKilnProject): void {
    localStorage.setItem(this.key, JSON.stringify(project));
  }

  backupLegacy(key: string, value: string): void {
    localStorage.setItem(`${this.key}:legacy:${key}`, value);
  }

  restoreLatestLegacy(): WebKilnProject | null {
    const raw =
      localStorage.getItem(`${this.key}:legacy:webkiln-pages`) ??
      localStorage.getItem(`${this.key}:legacy:webkiln-page`);
    if (!raw) return null;
    const project = createEmptyProject();
    try {
      const pages = JSON.parse(raw) as Record<string, string>;
      project.pages = Object.entries(pages).map(([name, html], index) => ({
        id: index === 0 ? 'home' : `legacy-${index}`,
        name,
        slug: index === 0 ? '/' : `/${name.toLowerCase().replace(/\s+/g, '-')}`,
        projectData: { components: html },
        updatedAt: new Date().toISOString(),
      }));
    } catch {
      project.pages = [
        {
          id: 'home',
          name: 'Home',
          slug: '/',
          projectData: { components: raw },
          updatedAt: new Date().toISOString(),
        },
      ];
    }
    project.currentPageId = project.pages[0]?.id ?? 'home';
    this.save(project);
    return project;
  }

  private loadLegacyProject(): WebKilnProject | null {
    const pagesRaw = localStorage.getItem('webkiln-pages');
    const pageRaw = localStorage.getItem('webkiln-page');
    if (!pagesRaw && !pageRaw) return null;
    if (pagesRaw) this.backupLegacy('webkiln-pages', pagesRaw);
    if (pageRaw) this.backupLegacy('webkiln-page', pageRaw);
    const project = createEmptyProject();
    try {
      const pages = pagesRaw
        ? (JSON.parse(pagesRaw) as Record<string, string>)
        : { Home: pageRaw ?? '' };
      project.pages = Object.entries(pages).map(([name, html], index) => ({
        id: index === 0 ? 'home' : `legacy-${index}`,
        name,
        slug: index === 0 ? '/' : `/${name.toLowerCase().replace(/\s+/g, '-')}`,
        projectData: { components: html },
        updatedAt: new Date().toISOString(),
      }));
      project.currentPageId = project.pages[0]?.id ?? 'home';
      this.save(project);
      return project;
    } catch {
      return null;
    }
  }
}
