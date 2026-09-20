import type { CmsCollection, CmsRecord } from '../cloud/contracts';
import type { PageDocument, WebKilnProject } from '../types';

export interface StaticExportFile {
  path: string;
  content: string;
  contentType: 'html' | 'css' | 'json' | 'csv' | 'xml';
}
export interface WebKilnBackup {
  format: 'webkiln-backup';
  version: 1;
  project: WebKilnProject;
  collections: Array<{ collection: CmsCollection; records: CmsRecord[] }>;
}

function stripUnsafeMarkup(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/\s(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '')
    .replace(/\sdata-gjs-[a-z-]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/\sclass\s*=\s*(["'])[^"']*\b(gjs-|gjs-)[^"']*\1/gi, '')
    .replace(/<div[^>]*class=("|')selection-tag[^>]*>[\s\S]*?<\/div>/gi, '');
}
function pageMarkup(page: PageDocument): string {
  const data = page.projectData as { components?: unknown; html?: string } | null;
  const raw =
    typeof data === 'string'
      ? data
      : typeof data?.components === 'string'
        ? data.components
        : (data?.html ?? '');
  return stripUnsafeMarkup(String(raw));
}
function relativeAssetPaths(html: string): string {
  return html.replace(/\b(src|poster)=("|')https?:\/\/[^"']+\/([^"']+)\2/gi, '$1=$2assets/$3$2');
}
export function extractPageHtml(page: PageDocument): string {
  return relativeAssetPaths(pageMarkup(page));
}
export function createStaticExport(project: WebKilnProject): StaticExportFile[] {
  const pages = project.pages.filter(
    (page) => !page.deletedAt && page.settings?.showInNavigation !== false,
  );
  const css = `:root{${Object.entries(project.themeTokens)
    .map(([key, value]) => `--wk-${key}:${value}`)
    .join(
      ';',
    )}}\n@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}`;
  const files: StaticExportFile[] = pages.map((page) => ({
    path: page.isHomepage
      ? 'index.html'
      : `${page.slug.replace(/^\/+|\/+$/g, '') || 'page'}/index.html`,
    contentType: 'html' as const,
    content: `<!doctype html><html lang="${project.site.language || 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(page.seo?.title || page.name)}</title><meta name="description" content="${escapeHtml(page.seo?.description || project.site.description)}"><link rel="stylesheet" href="../../styles.css"></head><body>${extractPageHtml(page)}</body></html>`,
  }));
  files.push({ path: 'styles.css', contentType: 'css', content: css });
  return files;
}
export function createSitemap(project: WebKilnProject, origin = ''): StaticExportFile {
  const urls = project.pages
    .filter((page) => !page.deletedAt && page.settings?.showInNavigation !== false)
    .map((page) => `${origin}${page.isHomepage ? '/' : page.slug}`);
  return {
    path: 'sitemap.xml',
    contentType: 'xml',
    content: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${escapeXml(url)}</loc></url>`).join('')}</urlset>`,
  };
}
export function createProjectBackup(
  project: WebKilnProject,
  collections: WebKilnBackup['collections'] = [],
): WebKilnBackup {
  const clone = JSON.parse(JSON.stringify(project)) as WebKilnProject;
  clone.site.id = 'portable-site';
  clone.pages = clone.pages.filter((page) => !page.deletedAt);
  return { format: 'webkiln-backup', version: 1, project: clone, collections };
}
export function parseProjectBackup(value: unknown): WebKilnBackup {
  if (!value || typeof value !== 'object') throw new Error('Invalid WebKiln backup');
  const backup = value as Partial<WebKilnBackup>;
  if (
    backup.format !== 'webkiln-backup' ||
    backup.version !== 1 ||
    !backup.project ||
    !Array.isArray(backup.project.pages)
  )
    throw new Error('Unsupported or malformed WebKiln backup');
  return createProjectBackup(
    backup.project,
    Array.isArray(backup.collections) ? backup.collections : [],
  );
}
export function recordsToCsv(records: CmsRecord[]): string {
  const fields = [...new Set(records.flatMap((record) => Object.keys(record.data)))];
  return [
    fields.join(','),
    ...records.map((record) => fields.map((field) => csvCell(record.data[field])).join(',')),
  ].join('\n');
}
export function importStaticHtml(html: string): { project: WebKilnProject; limitations: string[] } {
  if (!html || /<script\b/i.test(html))
    throw new Error('Static HTML containing scripts must be removed before import');
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const project: WebKilnProject = {
    schemaVersion: 3 as const,
    site: {
      id: 'imported-site',
      title: 'Imported website',
      description: '',
      language: 'en',
      timezone: 'UTC',
    },
    pages: [
      {
        id: 'home',
        name: 'Home',
        slug: '/',
        projectData: { components: stripUnsafeMarkup(body) },
        updatedAt: new Date().toISOString(),
        isHomepage: true,
        seo: { title: 'Imported website', description: '' },
        settings: { showInNavigation: true, passwordProtected: false },
      },
    ],
    deletedPages: [],
    homepagePageId: 'home',
    currentPageId: 'home',
    themeTokens: {},
    editorSettings: { mode: 'standard', breakpoints: [], responsiveIntents: {}, interactions: [] },
    assets: [],
    customCode: { html: '', css: '', javascript: '', isolated: true },
    revisions: [],
  };
  return {
    project,
    limitations: [
      'External assets are metadata-only until added to the asset library.',
      'Interactive scripts, server behavior, and third-party embeds are not imported.',
    ],
  };
}
function csvCell(value: unknown): string {
  const text =
    value === undefined || value === null
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}
function escapeXml(value: string): string {
  return escapeHtml(value);
}
