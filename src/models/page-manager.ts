import type { PageDocument, WebKilnProject } from '../types';

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'page';
}

export function uniqueSlug(project: WebKilnProject, requested: string, excludeId?: string): string {
  const base = requested === '/' ? '/' : `/${slugify(requested.replace(/^\//, ''))}`;
  const used = new Set(project.pages.filter((p) => p.id !== excludeId).map((p) => p.slug));
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

export function newPage(project: WebKilnProject, name = 'New page'): PageDocument {
  const id = `page-${crypto.randomUUID().slice(0, 8)}`;
  return {
    id,
    name,
    slug: uniqueSlug(project, name),
    projectData: null,
    updatedAt: new Date().toISOString(),
    isHomepage: false,
    seo: { title: name, description: '' },
    settings: { showInNavigation: true, passwordProtected: false },
  };
}

export function setHomepage(project: WebKilnProject, pageId: string): void {
  project.homepagePageId = pageId;
  project.pages.forEach((page) => (page.isHomepage = page.id === pageId));
}

export function setPageParent(
  project: WebKilnProject,
  pageId: string,
  parentId: string | null,
): boolean {
  const page = project.pages.find((item) => item.id === pageId);
  if (!page || pageId === parentId) return false;
  if (parentId !== null && !project.pages.some((item) => item.id === parentId)) return false;
  let cursor: string | undefined = parentId ?? undefined;
  while (cursor) {
    if (cursor === pageId) return false;
    cursor = project.pages.find((item) => item.id === cursor)?.parentId;
  }
  if (parentId) page.parentId = parentId;
  else delete page.parentId;
  return true;
}

export function setPageFolder(project: WebKilnProject, pageId: string, folder: string): boolean {
  const page = project.pages.find((item) => item.id === pageId);
  if (!page) return false;
  const normalized = folder.trim().replace(/^\/+|\/+$/g, '');
  if (normalized) page.folder = normalized;
  else delete page.folder;
  return true;
}

export function duplicatePage(project: WebKilnProject, source: PageDocument): PageDocument {
  const copy = newPage(project, `${source.name} copy`);
  copy.projectData = structuredClone(source.projectData);
  copy.parentId = source.parentId;
  copy.folder = source.folder;
  copy.seo = {
    ...(source.seo ?? { title: copy.name, description: '' }),
    title: `${source.name} copy`,
  };
  project.pages.push(copy);
  return copy;
}

export function removePage(project: WebKilnProject, pageId: string): PageDocument | null {
  if (project.pages.length <= 1) return null;
  const index = project.pages.findIndex((page) => page.id === pageId);
  if (index < 0) return null;
  const [page] = project.pages.splice(index, 1);
  page.deletedAt = new Date().toISOString();
  project.deletedPages.push(page);
  if (project.homepagePageId === pageId) setHomepage(project, project.pages[0].id);
  if (project.currentPageId === pageId)
    project.currentPageId = project.pages[Math.max(0, index - 1)].id;
  return page;
}

export function restorePage(project: WebKilnProject, pageId: string): PageDocument | null {
  const index = project.deletedPages.findIndex((page) => page.id === pageId);
  if (index < 0) return null;
  const [page] = project.deletedPages.splice(index, 1);
  delete page.deletedAt;
  page.slug = uniqueSlug(project, page.slug, page.id);
  project.pages.push(page);
  return page;
}
