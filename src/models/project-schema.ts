import type { WebKilnProject } from '../types';

export const CURRENT_SCHEMA_VERSION = 2 as const;

function normalizePage(page: Partial<WebKilnProject['pages'][number]>, index: number) {
  const id = page.id ?? (index === 0 ? 'home' : `page-${index + 1}`);
  return {
    id,
    name: page.name ?? (index === 0 ? 'Home' : `Page ${index + 1}`),
    slug: page.slug ?? (index === 0 ? '/' : `/page-${index + 1}`),
    projectData: page.projectData ?? null,
    updatedAt: page.updatedAt ?? new Date().toISOString(),
    isHomepage: page.isHomepage ?? index === 0,
    seo: page.seo ?? { title: page.name ?? '', description: '' },
    settings: page.settings ?? { showInNavigation: true, passwordProtected: false },
    ...(page.deletedAt ? { deletedAt: page.deletedAt } : {}),
  };
}

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
    deletedPages: [],
    currentPageId: 'home',
    homepagePageId: 'home',
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
    (candidate.schemaVersion === CURRENT_SCHEMA_VERSION || candidate.schemaVersion === 1) &&
    Array.isArray(candidate.pages) &&
    typeof candidate.site === 'object'
  );
}

export function migrateProject(value: unknown): WebKilnProject {
  if (isWebKilnProject(value)) {
    const candidate = value as WebKilnProject & { schemaVersion: number };
    return {
      ...createEmptyProject(),
      ...candidate,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      pages: candidate.pages.map(normalizePage),
      deletedPages: (candidate.deletedPages ?? []).map(normalizePage),
      homepagePageId: candidate.homepagePageId ?? candidate.pages[0]?.id ?? 'home',
    };
  }
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
