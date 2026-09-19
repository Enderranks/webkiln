import type { WebKilnProject } from '../types';

export const CURRENT_SCHEMA_VERSION = 1 as const;

export function createEmptyProject(): WebKilnProject {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    site: {
      id: 'local-site',
      title: 'Underline Hosting',
      description: '',
      language: 'en',
      timezone: 'UTC',
    },
    pages: [],
    currentPageId: 'home',
    themeTokens: { primary: '#d6ad61', radius: '10px' },
    assets: [],
    customCode: { html: '', css: '', javascript: '', isolated: true },
    revisions: [
      {
        id: 'initial',
        label: 'Initial checkpoint',
        createdAt: now,
        pageId: 'home',
        projectData: null,
      },
    ],
  };
}

export function isWebKilnProject(value: unknown): value is WebKilnProject {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WebKilnProject>;
  return (
    candidate.schemaVersion === CURRENT_SCHEMA_VERSION &&
    Array.isArray(candidate.pages) &&
    typeof candidate.site === 'object'
  );
}

export function migrateProject(value: unknown): WebKilnProject {
  if (isWebKilnProject(value)) return value;
  const project = createEmptyProject();
  if (value && typeof value === 'object') {
    const legacy = value as {
      site?: Partial<WebKilnProject['site']>;
      assets?: WebKilnProject['assets'];
    };
    project.site = { ...project.site, ...legacy.site };
    project.assets = Array.isArray(legacy.assets) ? legacy.assets : [];
  }
  return project;
}
