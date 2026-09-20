import type { WebKilnProject } from '../../src/types';

export interface PublishedPage {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  homepage: boolean;
  showInNavigation: boolean;
  passwordProtected: boolean;
  seo: { title: string; description: string; canonical?: string; robots?: string };
  html: string;
  css: string;
}

export interface PublishedSnapshot {
  schemaVersion: number;
  site: { title: string; description: string };
  pages: PublishedPage[];
  custom404?: PublishedPage;
  publishedAt: string;
}

const BLOCKED_TAGS =
  /<\/?(script|iframe|object|embed|applet|form|base|meta|link)(?:\s|>)[\s\S]*?>/gi;
const EVENT_ATTR = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

export function sanitizeHtml(input: string): string {
  return input
    .replace(BLOCKED_TAGS, '')
    .replace(EVENT_ATTR, '')
    .replace(/\s+(?:data-gjs-[\w:-]+|gjs-[\w:-]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+data-wk-[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:id|class)\s*=\s*(?:"[^"]*"|'[^']*')/gi, (attribute) =>
      /data-gjs-|gjs-|gjs-/i.test(attribute) ? '' : attribute,
    )
    .replace(
      /\s+(?:href|src|action|formaction)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|[^\s>]*javascript:[^\s>]*)/gi,
      '',
    )
    .replace(/javascript\s*:/gi, '')
    .replace(/srcdoc\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    .trim();
}

export function sanitizeCss(input: string): string {
  return input
    .replace(/@import[\s\S]*?;/gi, '')
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/url\s*\(\s*["']?\s*javascript:[^)]*\)/gi, '')
    .replace(/behavior\s*:[^;{}]+;?/gi, '')
    .replace(/-moz-binding\s*:[^;{}]+;?/gi, '')
    .trim();
}

export function formatPublicValue(value: unknown, format: string): string {
  const text = String(value ?? '');
  if (format === 'uppercase') return text.toUpperCase();
  if (format === 'lowercase') return text.toLowerCase();
  if (format === 'date') {
    const date = new Date(text);
    return Number.isNaN(date.valueOf())
      ? text
      : new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
  }
  return text;
}

function componentToHtml(component: unknown): string {
  if (typeof component === 'string') return component;
  if (Array.isArray(component)) return component.map(componentToHtml).join('');
  if (!component || typeof component !== 'object') return '';
  const item = component as {
    tagName?: string;
    type?: string;
    attributes?: Record<string, unknown>;
    components?: unknown;
    content?: string;
  };
  if (item.type === 'text') return String(item.content ?? '');
  const tag = /^[a-z][a-z0-9-]*$/i.test(item.tagName ?? '') ? item.tagName : 'div';
  const attributes = Object.entries(item.attributes ?? {})
    .filter(([name]) => !/^on/i.test(name) && !/^data-gjs/i.test(name))
    .map(
      ([name, value]) =>
        ` ${name.replace(/[^a-zA-Z0-9_:-]/g, '')}="${String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`,
    )
    .join('');
  const children =
    item.components !== undefined ? componentToHtml(item.components) : String(item.content ?? '');
  return `<${tag}${attributes}>${children}</${tag}>`;
}

export function extractProjectMarkup(projectData: unknown): { html: string; css: string } {
  const data = (projectData && typeof projectData === 'object' ? projectData : {}) as {
    components?: unknown;
    styles?: unknown;
  };
  const styles = Array.isArray(data.styles)
    ? data.styles.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('\n')
    : String(data.styles ?? '');
  return { html: sanitizeHtml(componentToHtml(data.components ?? '')), css: sanitizeCss(styles) };
}

export function createPublishedSnapshot(
  project: WebKilnProject,
  publishedAt = new Date().toISOString(),
): PublishedSnapshot {
  const pages = project.pages
    .filter((page) => !page.deletedAt)
    .map((page, index) => {
      const markup = extractProjectMarkup(page.projectData);
      return {
        id: page.id,
        name: page.name,
        slug: normalizeSlug(page.slug),
        sortOrder: index,
        homepage: Boolean(page.isHomepage),
        showInNavigation: page.settings?.showInNavigation !== false,
        passwordProtected: page.settings?.passwordProtected === true,
        seo: {
          title: page.seo?.title || page.name,
          description: page.seo?.description || project.site.description,
          canonical: page.seo?.canonical,
          robots: 'index,follow',
        },
        ...markup,
      };
    });
  const custom404 = pages.find((page) => page.slug === '/404');
  return {
    schemaVersion: project.schemaVersion,
    site: { title: project.site.title, description: project.site.description },
    pages,
    custom404,
    publishedAt,
  };
}

export function normalizeSlug(slug: string): string {
  const clean = `/${slug.replace(/^\/+/, '').replace(/\/+$/, '')}`;
  return clean === '/' ? '/' : clean.toLowerCase();
}

export function hashPassword(password: string): Promise<string> {
  return crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(password))
    .then((buffer) =>
      Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    );
}

export function publicHtml(
  snapshot: PublishedSnapshot,
  page: PublishedPage | undefined,
  publicUrl: string,
  passwordRequired = false,
): string {
  if (passwordRequired)
    return pageShell(
      snapshot.site.title,
      snapshot.site.description,
      `<main class="wk-password"><h1>This site is private</h1><p>Enter the site password to continue.</p><form method="post" action="${publicUrl}/__access"><input name="password" type="password" required autocomplete="current-password"><button type="submit">Continue</button></form></main>`,
      '',
      publicUrl,
      'noindex',
    );
  if (!page)
    return pageShell(
      snapshot.site.title,
      snapshot.site.description,
      '<main class="wk-not-found"><h1>Page not found</h1><p>The page you requested does not exist.</p><a href="/">Return home</a></main>',
      '',
      publicUrl,
      'noindex',
    );
  const navigation = snapshot.pages
    .filter((item) => item.showInNavigation && item.slug !== '/404')
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(
      (item) =>
        `<a href="${publicUrl}${item.slug === '/' ? '' : item.slug}">${escapeText(item.name)}</a>`,
    )
    .join('');
  const html = `<header class="wk-header"><a class="wk-brand" href="${publicUrl}">${escapeText(snapshot.site.title)}</a><nav>${navigation}</nav></header><main>${page.html}</main>`;
  return pageShell(
    page.seo.title || snapshot.site.title,
    page.seo.description || snapshot.site.description,
    html,
    page.css,
    page.seo.canonical || `${publicUrl}${page.slug === '/' ? '' : page.slug}`,
    page.seo.robots,
  );
}

function pageShell(
  title: string,
  description: string,
  body: string,
  css: string,
  canonical: string,
  robots = 'index,follow',
): string {
  const safeTitle = escapeText(title);
  const safeDescription = escapeAttribute(description);
  const safeCanonical = escapeAttribute(canonical);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><meta name="description" content="${safeDescription}"><meta name="robots" content="${escapeAttribute(robots)}"><link rel="canonical" href="${safeCanonical}"><meta property="og:title" content="${safeTitle}"><meta property="og:description" content="${safeDescription}"><meta property="og:url" content="${safeCanonical}"><style>${css}</style><style>body{margin:0}.wk-header{display:flex;justify-content:space-between;gap:24px;padding:18px 6%;align-items:center}.wk-header nav{display:flex;gap:18px}.wk-header a{color:inherit;text-decoration:none}.wk-password,.wk-not-found{max-width:640px;margin:15vh auto;padding:24px;font-family:system-ui,sans-serif}.wk-password form{display:flex;gap:8px}.wk-password input,.wk-password button{padding:10px}</style></head><body>${body}</body></html>`;
}
function escapeText(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}
function escapeAttribute(value: string): string {
  return escapeText(value);
}
