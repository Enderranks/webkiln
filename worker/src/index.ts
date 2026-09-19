import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { getAuth } from './auth';
import { getDb } from './db/client';
import {
  auditEvent,
  page,
  publishedRelease,
  publishedSite,
  site,
  siteRevision,
  workspace,
  workspaceMembership,
} from './db/schema';
import type { Env } from './env';
import { currentUser, requireMembership } from './security';
import {
  createPublishedSnapshot,
  hashPassword,
  normalizeSlug,
  publicHtml,
  type PublishedSnapshot,
} from './publishing';
import type { WebKilnProject } from '../../src/types';

const app = new Hono<{ Bindings: Env }>();
const jsonError = (
  c: Context<{ Bindings: Env }>,
  status: 400 | 401 | 403 | 404 | 409 | 413 | 500,
  code: string,
  message: string,
) => c.json({ error: { code, message } }, status);

app.use('/api/auth/*', async (c, next) => {
  const response = await cors({
    origin: c.env.APP_ORIGIN,
    credentials: true,
    allowHeaders: ['Content-Type'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  })(c, next);
  return response;
});
app.all('/api/auth/*', (c) => getAuth(c.env).handler(c.req.raw));
app.get('/api/health', (c) => c.json({ ok: true, environment: c.env.ENVIRONMENT, database: 'd1' }));

app.get('/api/workspaces', async (c) => {
  const user = await currentUser(c);
  if (!user) return jsonError(c, 401, 'UNAUTHENTICATED', 'Sign in required');
  const rows = await getDb(c.env.DB)
    .select({ workspace, membership: workspaceMembership })
    .from(workspaceMembership)
    .innerJoin(workspace, eq(workspaceMembership.workspaceId, workspace.id))
    .where(eq(workspaceMembership.userId, user.id))
    .all();
  return c.json(rows.map((row) => ({ ...row.workspace, role: row.membership.role })));
});

app.post('/api/workspaces', async (c) => {
  const user = await currentUser(c);
  if (!user) return jsonError(c, 401, 'UNAUTHENTICATED', 'Sign in required');
  const body = await c.req.json<{ name?: string }>();
  const name = body.name?.trim();
  if (!name || name.length > 80)
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Workspace name is required');
  const id = crypto.randomUUID();
  const slug = `${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-${id.slice(0, 6)}`;
  const now = new Date();
  const db = getDb(c.env.DB);
  await db.batch([
    db
      .insert(workspace)
      .values({ id, name, slug, ownerUserId: user.id, createdAt: now, updatedAt: now }),
    db.insert(workspaceMembership).values({
      id: crypto.randomUUID(),
      workspaceId: id,
      userId: user.id,
      role: 'owner',
      invitationStatus: 'accepted',
      createdAt: now,
      updatedAt: now,
    }),
  ]);
  return c.json({ id, name, slug, ownerUserId: user.id, role: 'owner' }, 201);
});

app.get('/api/workspaces/:workspaceId', async (c) => {
  const access = await requireMembership(c, c.req.param('workspaceId'), [
    'owner',
    'admin',
    'editor',
    'viewer',
  ]);
  if ('error' in access)
    return jsonError(
      c,
      access.error === 'UNAUTHENTICATED' ? 401 : 403,
      access.error === 'UNAUTHENTICATED' ? 'UNAUTHENTICATED' : 'FORBIDDEN',
      access.error === 'UNAUTHENTICATED' ? 'Sign in required' : 'Forbidden',
    );
  const item = await getDb(c.env.DB)
    .select()
    .from(workspace)
    .where(eq(workspace.id, c.req.param('workspaceId')))
    .get();
  return item
    ? c.json({ ...item, role: access.membership.role })
    : jsonError(c, 404, 'NOT_FOUND', 'Workspace not found');
});

app.get('/api/workspaces/:workspaceId/sites', async (c) => {
  const access = await requireMembership(c, c.req.param('workspaceId'), [
    'owner',
    'admin',
    'editor',
    'viewer',
  ]);
  if ('error' in access)
    return jsonError(
      c,
      access.error === 'UNAUTHENTICATED' ? 401 : 403,
      access.error === 'UNAUTHENTICATED' ? 'UNAUTHENTICATED' : 'FORBIDDEN',
      access.error === 'UNAUTHENTICATED' ? 'Sign in required' : 'Forbidden',
    );
  const rows = await getDb(c.env.DB)
    .select()
    .from(site)
    .where(eq(site.workspaceId, c.req.param('workspaceId')))
    .orderBy(desc(site.updatedAt))
    .all();
  const published = await getDb(c.env.DB)
    .select({ siteId: publishedSite.siteId, releaseId: publishedSite.currentReleaseId })
    .from(publishedSite)
    .all();
  const publishedIds = new Set(
    published.filter((item) => item.releaseId).map((item) => item.siteId),
  );
  return c.json(rows.map((item) => ({ ...item, published: publishedIds.has(item.id) })));
});

app.post('/api/workspaces/:workspaceId/sites', async (c) => {
  const access = await requireMembership(c, c.req.param('workspaceId'), [
    'owner',
    'admin',
    'editor',
  ]);
  if ('error' in access)
    return jsonError(
      c,
      access.error === 'UNAUTHENTICATED' ? 401 : 403,
      access.error === 'UNAUTHENTICATED' ? 'UNAUTHENTICATED' : 'FORBIDDEN',
      access.error === 'UNAUTHENTICATED' ? 'Sign in required' : 'Forbidden',
    );
  const body = await c.req.json<{ name?: string }>();
  const name = body.name?.trim();
  if (!name || name.length > 100)
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Site name is required');
  const id = crypto.randomUUID();
  const now = new Date();
  const slug = `${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-${id.slice(0, 6)}`;
  const db = getDb(c.env.DB);
  await db.insert(site).values({
    id,
    workspaceId: c.req.param('workspaceId'),
    name,
    slug,
    createdBy: access.user.id,
    updatedBy: access.user.id,
    createdAt: now,
    updatedAt: now,
  });
  return c.json(
    {
      id,
      workspaceId: c.req.param('workspaceId'),
      name,
      slug,
      status: 'active',
      homepagePageId: null,
      currentRevision: 0,
      pageCount: 0,
      updatedAt: now.toISOString(),
      updatedBy: access.user.id,
    },
    201,
  );
});

app.get('/api/sites/:siteId', async (c) => {
  const record = await getSiteAccess(c, 'viewer');
  if ('error' in record) return record.response;
  const pages = await getDb(c.env.DB)
    .select()
    .from(page)
    .where(and(eq(page.siteId, record.site.id), isNull(page.deletedAt)))
    .all();
  return c.json(toCloudSite(record.site, pages.length, record.user));
});

app.patch('/api/sites/:siteId', async (c) => {
  const record = await getSiteAccess(c, 'editor');
  if ('error' in record) return record.response;
  const body = await c.req.json<{ name?: string; status?: 'active' | 'archived' }>();
  const updates: { name?: string; status?: string; updatedBy: string; updatedAt: Date } = {
    updatedBy: record.user.id,
    updatedAt: new Date(),
  };
  if (body.name?.trim()) updates.name = body.name.trim();
  if (body.status === 'active' || body.status === 'archived') updates.status = body.status;
  await getDb(c.env.DB).update(site).set(updates).where(eq(site.id, record.site.id));
  return c.json({ ok: true });
});

app.get('/api/sites/:siteId/pages', async (c) => {
  const record = await getSiteAccess(c, 'viewer');
  if ('error' in record) return record.response;
  const pages = await getDb(c.env.DB)
    .select()
    .from(page)
    .where(and(eq(page.siteId, record.site.id), isNull(page.deletedAt)))
    .orderBy(asc(page.sortOrder))
    .all();
  return c.json(pages.map(toPage));
});

app.post('/api/sites/:siteId/pages', async (c) => {
  const record = await getSiteAccess(c, 'editor');
  if ('error' in record) return record.response;
  const body = await c.req.json<{ name?: string; slug?: string; projectData?: unknown }>();
  const name = body.name?.trim();
  if (!name) return jsonError(c, 400, 'VALIDATION_ERROR', 'Page name is required');
  const db = getDb(c.env.DB);
  const count = await db
    .select()
    .from(page)
    .where(and(eq(page.siteId, record.site.id), isNull(page.deletedAt)))
    .all();
  const now = new Date();
  const created = {
    id: crypto.randomUUID(),
    siteId: record.site.id,
    name,
    slug: body.slug?.startsWith('/')
      ? body.slug
      : `/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    sortOrder: count.length,
    homepage: count.length === 0,
    showInNavigation: true,
    passwordProtected: false,
    seoTitle: name,
    seoDescription: '',
    canonicalUrl: null,
    projectData: JSON.stringify(body.projectData ?? null),
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db.insert(page).values(created);
  } catch {
    return jsonError(c, 409, 'CONFLICT', 'Page slug already exists');
  }
  return c.json(toPage(created), 201);
});

app.patch('/api/sites/:siteId/pages/:pageId', async (c) => {
  const record = await getSiteAccess(c, 'editor');
  if ('error' in record) return record.response;
  const body = await c.req.json<{
    name?: string;
    slug?: string;
    showInNavigation?: boolean;
    passwordProtected?: boolean;
    seoTitle?: string;
    seoDescription?: string;
    canonicalUrl?: string | null;
    projectData?: unknown;
  }>();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.slug !== undefined) updates.slug = body.slug;
  if (body.showInNavigation !== undefined) updates.showInNavigation = body.showInNavigation;
  if (body.passwordProtected !== undefined) updates.passwordProtected = body.passwordProtected;
  if (body.seoTitle !== undefined) updates.seoTitle = body.seoTitle;
  if (body.seoDescription !== undefined) updates.seoDescription = body.seoDescription;
  if (body.canonicalUrl !== undefined) updates.canonicalUrl = body.canonicalUrl;
  if (body.projectData !== undefined) updates.projectData = JSON.stringify(body.projectData);
  try {
    await getDb(c.env.DB)
      .update(page)
      .set(updates)
      .where(and(eq(page.id, c.req.param('pageId')), eq(page.siteId, record.site.id)));
  } catch {
    return jsonError(c, 409, 'CONFLICT', 'Page slug already exists');
  }
  return c.json({ ok: true });
});

app.delete('/api/sites/:siteId/pages/:pageId', async (c) => {
  const record = await getSiteAccess(c, 'editor');
  if ('error' in record) return record.response;
  const pages = await getDb(c.env.DB)
    .select()
    .from(page)
    .where(and(eq(page.siteId, record.site.id), isNull(page.deletedAt)))
    .all();
  if (pages.length <= 1) return jsonError(c, 409, 'CONFLICT', 'The last page cannot be deleted');
  await getDb(c.env.DB)
    .update(page)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(page.id, c.req.param('pageId')), eq(page.siteId, record.site.id)));
  return c.json({ ok: true });
});

app.post('/api/sites/:siteId/pages/:pageId/restore', async (c) => {
  const record = await getSiteAccess(c, 'editor');
  if ('error' in record) return record.response;
  await getDb(c.env.DB)
    .update(page)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(page.id, c.req.param('pageId')), eq(page.siteId, record.site.id)));
  return c.json({ ok: true });
});

app.post('/api/sites/:siteId/pages/reorder', async (c) => {
  const record = await getSiteAccess(c, 'editor');
  if ('error' in record) return record.response;
  const body = await c.req.json<{ pageIds?: string[] }>();
  if (!Array.isArray(body.pageIds))
    return jsonError(c, 400, 'VALIDATION_ERROR', 'pageIds is required');
  const db = getDb(c.env.DB);
  for (const [sortOrder, pageId] of body.pageIds.entries())
    await db
      .update(page)
      .set({ sortOrder, updatedAt: new Date() })
      .where(and(eq(page.id, pageId), eq(page.siteId, record.site.id)));
  return c.json({ ok: true });
});

app.get('/api/sites/:siteId/project', async (c) => {
  const record = await getSiteAccess(c, 'viewer');
  if ('error' in record) return record.response;
  const db = getDb(c.env.DB);
  const pages = await db
    .select()
    .from(page)
    .where(and(eq(page.siteId, record.site.id), isNull(page.deletedAt)))
    .orderBy(asc(page.sortOrder))
    .all();
  const revisions = await db
    .select()
    .from(siteRevision)
    .where(eq(siteRevision.siteId, record.site.id))
    .orderBy(desc(siteRevision.revisionNumber))
    .all();
  const project = {
    schemaVersion: 2,
    site: {
      id: record.site.id,
      title: record.site.name,
      description: '',
      language: 'en',
      timezone: 'UTC',
    },
    pages: pages.map(toPage),
    deletedPages: [],
    currentPageId: pages.find((item) => item.homepage)?.id ?? pages[0]?.id ?? 'home',
    homepagePageId: pages.find((item) => item.homepage)?.id ?? 'home',
    themeTokens: JSON.parse(record.site.themeData),
    editorSettings: JSON.parse(record.site.editorSettings ?? '{}'),
    assets: [],
    customCode: { html: '', css: '', javascript: '', isolated: true as const },
    revisions: revisions.map((item) => ({
      id: item.id,
      label: item.name,
      createdAt: new Date(item.createdAt).toISOString(),
      pageId: pages[0]?.id ?? 'home',
      projectData: JSON.parse(item.snapshotData),
    })),
  };
  return c.json({
    site: toCloudSite(record.site, pages.length, accessUser(record)),
    project,
    serverRevision: record.site.currentRevision,
  });
});

app.put('/api/sites/:siteId/project', async (c) => {
  const record = await getSiteAccess(c, 'editor');
  if ('error' in record) return record.response;
  const body = await c.req.json<{
    project?: {
      pages?: Array<Record<string, unknown>>;
      themeTokens?: Record<string, string>;
      editorSettings?: Record<string, unknown>;
    };
    expectedRevision?: number;
  }>();
  if (!body.project || typeof body.expectedRevision !== 'number')
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Project and expected revision are required');
  if (body.project.pages && JSON.stringify(body.project).length > 8 * 1024 * 1024)
    return jsonError(c, 413, 'VALIDATION_ERROR', 'Project payload is too large');
  if (body.expectedRevision !== record.site.currentRevision)
    return jsonError(c, 409, 'REVISION_MISMATCH', 'The project changed on the server');
  const now = new Date();
  const db = getDb(c.env.DB);
  const nextRevision = record.site.currentRevision + 1;
  const pageUpdates = (body.project.pages ?? []).map((item, index) =>
    db
      .update(page)
      .set({
        name: String(item.name ?? `Page ${index + 1}`),
        slug: String(item.slug ?? `/page-${index + 1}`),
        projectData: JSON.stringify(item.projectData ?? null),
        sortOrder: index,
        updatedAt: now,
      })
      .where(and(eq(page.id, String(item.id)), eq(page.siteId, record.site.id))),
  );
  await db
    .update(site)
    .set({
      currentRevision: nextRevision,
      updatedBy: record.user.id,
      updatedAt: now,
      themeData: JSON.stringify(body.project.themeTokens ?? {}),
      editorSettings: JSON.stringify(body.project.editorSettings ?? {}),
    })
    .where(eq(site.id, record.site.id));
  await db.insert(auditEvent).values({
    id: crypto.randomUUID(),
    workspaceId: record.site.workspaceId,
    userId: record.user.id,
    siteId: record.site.id,
    action: 'project.updated',
    resourceType: 'site',
    resourceId: record.site.id,
    metadata: JSON.stringify({ revision: nextRevision }),
    createdAt: now,
  });
  for (const update of pageUpdates) await update;
  return c.json({ serverRevision: nextRevision });
});

app.get('/api/sites/:siteId/revisions', async (c) => {
  const record = await getSiteAccess(c, 'viewer');
  if ('error' in record) return record.response;
  const rows = await getDb(c.env.DB)
    .select()
    .from(siteRevision)
    .where(eq(siteRevision.siteId, record.site.id))
    .orderBy(desc(siteRevision.revisionNumber))
    .all();
  return c.json(rows);
});

app.post('/api/sites/:siteId/revisions', async (c) => {
  const record = await getSiteAccess(c, 'editor');
  if ('error' in record) return record.response;
  const body = await c.req.json<{ name?: string; expectedRevision?: number }>();
  if (!body.name?.trim() || body.expectedRevision !== record.site.currentRevision)
    return jsonError(c, 409, 'REVISION_MISMATCH', 'A current revision is required');
  const db = getDb(c.env.DB);
  const pages = await db.select().from(page).where(eq(page.siteId, record.site.id)).all();
  const now = new Date();
  const revision = {
    id: crypto.randomUUID(),
    siteId: record.site.id,
    revisionNumber: record.site.currentRevision + 1,
    name: body.name.trim(),
    snapshotData: JSON.stringify({ pages }),
    createdBy: record.user.id,
    restoreSourceRevision: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.batch([
    db.insert(siteRevision).values(revision),
    db
      .update(site)
      .set({ currentRevision: revision.revisionNumber, updatedAt: now, updatedBy: record.user.id })
      .where(eq(site.id, record.site.id)),
  ]);
  return c.json(revision, 201);
});

app.post('/api/sites/:siteId/revisions/:revisionId/restore', async (c) => {
  const record = await getSiteAccess(c, 'editor');
  if ('error' in record) return record.response;
  const body = await c.req.json<{ expectedRevision?: number }>();
  if (body.expectedRevision !== record.site.currentRevision)
    return jsonError(c, 409, 'REVISION_MISMATCH', 'The project changed on the server');
  const db = getDb(c.env.DB);
  const selected = await db
    .select()
    .from(siteRevision)
    .where(
      and(eq(siteRevision.id, c.req.param('revisionId')), eq(siteRevision.siteId, record.site.id)),
    )
    .get();
  if (!selected) return jsonError(c, 404, 'NOT_FOUND', 'Revision not found');
  const snapshot = JSON.parse(selected.snapshotData) as { pages?: Array<typeof page.$inferInsert> };
  const now = new Date();
  const safety = {
    id: crypto.randomUUID(),
    siteId: record.site.id,
    revisionNumber: record.site.currentRevision + 1,
    name: 'Safety checkpoint before restore',
    snapshotData: JSON.stringify({
      pages: await db.select().from(page).where(eq(page.siteId, record.site.id)).all(),
    }),
    createdBy: record.user.id,
    restoreSourceRevision: selected.revisionNumber,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(siteRevision).values(safety);
  for (const item of snapshot.pages ?? [])
    await db
      .update(page)
      .set({
        name: item.name,
        slug: item.slug,
        sortOrder: item.sortOrder,
        homepage: item.homepage,
        showInNavigation: item.showInNavigation,
        passwordProtected: item.passwordProtected,
        seoTitle: item.seoTitle,
        seoDescription: item.seoDescription,
        canonicalUrl: item.canonicalUrl,
        projectData: item.projectData,
        deletedAt: item.deletedAt,
        updatedAt: now,
      })
      .where(and(eq(page.id, item.id), eq(page.siteId, record.site.id)));
  await db
    .update(site)
    .set({ currentRevision: safety.revisionNumber, updatedAt: now, updatedBy: record.user.id })
    .where(eq(site.id, record.site.id));
  return c.json({
    serverRevision: safety.revisionNumber,
    restoredRevision: selected.revisionNumber,
  });
});

app.get('/api/sites/:siteId/publish-status', async (c) => {
  const record = await getSiteAccess(c, 'viewer');
  if ('error' in record) return record.response;
  const db = getDb(c.env.DB);
  const current = await db
    .select()
    .from(publishedSite)
    .where(eq(publishedSite.siteId, record.site.id))
    .get();
  const releases = await db
    .select({
      id: publishedRelease.id,
      releaseNumber: publishedRelease.releaseNumber,
      sourceRevision: publishedRelease.sourceRevision,
      createdBy: publishedRelease.createdBy,
      createdAt: publishedRelease.createdAt,
    })
    .from(publishedRelease)
    .where(eq(publishedRelease.siteId, record.site.id))
    .orderBy(desc(publishedRelease.releaseNumber))
    .all();
  return c.json({
    published: Boolean(current?.currentReleaseId),
    currentReleaseId: current?.currentReleaseId ?? null,
    publishedAt: current?.publishedAt?.toISOString() ?? null,
    publicUrl: current?.currentReleaseId ? publicSiteUrl(c, record.site.slug) : null,
    releases,
  });
});

app.post('/api/sites/:siteId/publish', async (c) => {
  const record = await getSiteAccess(c, 'editor');
  if ('error' in record) return record.response;
  const body = await c.req.json<{ expectedRevision?: number; password?: string }>();
  if (body.expectedRevision !== undefined && body.expectedRevision !== record.site.currentRevision)
    return jsonError(c, 409, 'REVISION_MISMATCH', 'The project changed on the server');
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(page)
    .where(and(eq(page.siteId, record.site.id), isNull(page.deletedAt)))
    .orderBy(asc(page.sortOrder))
    .all();
  const project = projectFromRows(record.site, rows);
  const protectedPages = rows.some((item) => item.passwordProtected);
  const existing = await db
    .select()
    .from(publishedSite)
    .where(eq(publishedSite.siteId, record.site.id))
    .get();
  if (protectedPages && !body.password && !existing?.passwordHash)
    return jsonError(c, 400, 'VALIDATION_ERROR', 'A password is required for protected pages');
  if (JSON.stringify(project).length > 8 * 1024 * 1024)
    return jsonError(c, 413, 'VALIDATION_ERROR', 'Project payload is too large to publish');
  const now = new Date();
  const snapshot = createPublishedSnapshot(project, now.toISOString());
  const previous = await db
    .select({ releaseNumber: publishedRelease.releaseNumber })
    .from(publishedRelease)
    .where(eq(publishedRelease.siteId, record.site.id))
    .orderBy(desc(publishedRelease.releaseNumber))
    .get();
  const releaseNumber = (previous?.releaseNumber ?? 0) + 1;
  const release = {
    id: crypto.randomUUID(),
    siteId: record.site.id,
    releaseNumber,
    sourceRevision: record.site.currentRevision,
    snapshotData: JSON.stringify(snapshot),
    createdBy: record.user.id,
    createdAt: now,
  };
  const passwordHash = body.password
    ? await hashPassword(body.password)
    : (existing?.passwordHash ?? null);
  await db.batch([
    db.insert(publishedRelease).values(release),
    existing
      ? db
          .update(publishedSite)
          .set({ currentReleaseId: release.id, passwordHash, publishedAt: now, updatedAt: now })
          .where(eq(publishedSite.siteId, record.site.id))
      : db.insert(publishedSite).values({
          siteId: record.site.id,
          currentReleaseId: release.id,
          passwordHash,
          publishedAt: now,
          updatedAt: now,
        }),
    db.insert(auditEvent).values({
      id: crypto.randomUUID(),
      workspaceId: record.site.workspaceId,
      userId: record.user.id,
      siteId: record.site.id,
      action: 'site.published',
      resourceType: 'published_release',
      resourceId: release.id,
      metadata: JSON.stringify({ releaseNumber, sourceRevision: record.site.currentRevision }),
      createdAt: now,
    }),
  ]);
  return c.json(
    {
      published: true,
      releaseId: release.id,
      releaseNumber,
      sourceRevision: release.sourceRevision,
      publishedAt: now.toISOString(),
      publicUrl: publicSiteUrl(c, record.site.slug),
    },
    201,
  );
});

app.post('/api/sites/:siteId/unpublish', async (c) => {
  const record = await getSiteAccess(c, 'editor');
  if ('error' in record) return record.response;
  const now = new Date();
  await getDb(c.env.DB)
    .update(publishedSite)
    .set({ currentReleaseId: null, publishedAt: null, passwordHash: null, updatedAt: now })
    .where(eq(publishedSite.siteId, record.site.id));
  return c.json({ published: false });
});

app.post('/api/sites/:siteId/publish/:releaseId/rollback', async (c) => {
  const record = await getSiteAccess(c, 'editor');
  if ('error' in record) return record.response;
  const db = getDb(c.env.DB);
  const selected = await db
    .select()
    .from(publishedRelease)
    .where(
      and(
        eq(publishedRelease.id, c.req.param('releaseId')),
        eq(publishedRelease.siteId, record.site.id),
      ),
    )
    .get();
  if (!selected) return jsonError(c, 404, 'NOT_FOUND', 'Published release not found');
  const current = await db
    .select()
    .from(publishedSite)
    .where(eq(publishedSite.siteId, record.site.id))
    .get();
  const previous = await db
    .select({ releaseNumber: publishedRelease.releaseNumber })
    .from(publishedRelease)
    .where(eq(publishedRelease.siteId, record.site.id))
    .orderBy(desc(publishedRelease.releaseNumber))
    .get();
  const now = new Date();
  const release = {
    id: crypto.randomUUID(),
    siteId: record.site.id,
    releaseNumber: (previous?.releaseNumber ?? 0) + 1,
    sourceRevision: selected.sourceRevision,
    snapshotData: selected.snapshotData,
    createdBy: record.user.id,
    createdAt: now,
  };
  await db.batch([
    db.insert(publishedRelease).values(release),
    current
      ? db
          .update(publishedSite)
          .set({ currentReleaseId: release.id, publishedAt: now, updatedAt: now })
          .where(eq(publishedSite.siteId, record.site.id))
      : db.insert(publishedSite).values({
          siteId: record.site.id,
          currentReleaseId: release.id,
          publishedAt: now,
          updatedAt: now,
        }),
  ]);
  return c.json({
    published: true,
    releaseId: release.id,
    releaseNumber: release.releaseNumber,
    rolledBackTo: selected.id,
    publicUrl: publicSiteUrl(c, record.site.slug),
  });
});

app.get('/sites/:siteSlug/sitemap.xml', async (c) => {
  const published = await getPublishedSite(c, c.req.param('siteSlug'));
  if (!published) return publicHtmlResponse(c, '<main><h1>Not found</h1></main>', 404);
  const snapshot = published.snapshot;
  const base = publicSiteUrl(c, published.site.slug);
  const urls = snapshot.pages
    .filter((item) => item.slug !== '/404')
    .map(
      (item) =>
        `<url><loc>${escapeXml(`${base}${item.slug === '/' ? '' : item.slug}`)}</loc></url>`,
    )
    .join('');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    {
      headers: {
        'Content-Type': 'application/xml; charset=UTF-8',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
});

app.post('/sites/:siteSlug/__access', async (c) => {
  const published = await getPublishedSite(c, c.req.param('siteSlug'));
  if (!published?.published.passwordHash)
    return publicHtmlResponse(c, '<main><h1>Not found</h1></main>', 404);
  const form = await c.req.parseBody();
  const password = typeof form.password === 'string' ? form.password : '';
  if (!password || (await hashPassword(password)) !== published.published.passwordHash)
    return publicHtmlResponse(
      c,
      '<main><h1>Incorrect password</h1><p>Please go back and try again.</p></main>',
      403,
    );
  const token = await createAccessToken(c.env.BETTER_AUTH_SECRET, published.site.id);
  const target = new URL(c.req.url);
  target.pathname = `/sites/${published.site.slug}`;
  target.search = '';
  return new Response(null, {
    status: 303,
    headers: {
      Location: target.toString(),
      'Set-Cookie': `wk_public_access=${token}; Path=/sites/${published.site.slug}; Max-Age=86400; HttpOnly; Secure; SameSite=Lax`,
    },
  });
});

app.get('/sites/:siteSlug', async (c) => renderPublicPage(c, c.req.param('siteSlug'), '/'));
app.get('/sites/:siteSlug/:pageSlug', async (c) =>
  renderPublicPage(c, c.req.param('siteSlug'), normalizeSlug(c.req.param('pageSlug'))),
);

app.notFound((c) => {
  if (new URL(c.req.url).pathname.startsWith('/api/')) {
    return jsonError(c, 404, 'NOT_FOUND', 'API route not found');
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

async function renderPublicPage(
  c: Context<{ Bindings: Env }>,
  siteSlug: string,
  pageSlug: string,
): Promise<Response> {
  const published = await getPublishedSite(c, siteSlug);
  if (!published) return publicHtmlResponse(c, '<main><h1>Not found</h1></main>', 404);
  const foundPage = published.snapshot.pages.find((item) => item.slug === pageSlug);
  const page = foundPage ?? published.snapshot.custom404;
  const hasAccess =
    !published.published.passwordHash ||
    (await validAccessToken(c, published.site.id, c.env.BETTER_AUTH_SECRET));
  const html = publicHtml(
    published.snapshot,
    page,
    publicSiteUrl(c, published.site.slug),
    Boolean(published.published.passwordHash) && !hasAccess,
  );
  return publicHtmlResponse(c, html, foundPage ? 200 : 404);
}

async function getPublishedSite(c: Context<{ Bindings: Env }>, siteSlug: string) {
  const slug = siteSlug.toLowerCase();
  const record = await getDb(c.env.DB)
    .select({ site, published: publishedSite, release: publishedRelease })
    .from(site)
    .innerJoin(publishedSite, eq(publishedSite.siteId, site.id))
    .innerJoin(publishedRelease, eq(publishedRelease.id, publishedSite.currentReleaseId))
    .where(eq(site.slug, slug))
    .get();
  if (!record || !record.published.currentReleaseId) return null;
  return {
    site: record.site,
    published: record.published,
    snapshot: JSON.parse(record.release.snapshotData) as PublishedSnapshot,
  };
}

function publicHtmlResponse(
  c: Context<{ Bindings: Env }>,
  html: string,
  status: 200 | 403 | 404,
): Response {
  const response = c.html(html, status);
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'",
  );
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}

function publicSiteUrl(c: Context<{ Bindings: Env }>, slug: string): string {
  return `${new URL(c.req.url).origin}/sites/${encodeURIComponent(slug)}`;
}
function escapeXml(value: string): string {
  return value.replace(
    /[<>&'"]/g,
    (character) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character] ??
      character,
  );
}
function readCookie(c: Context<{ Bindings: Env }>, name: string): string | null {
  const raw = c.req.header('Cookie') ?? '';
  const item = raw
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}
async function createAccessToken(secret: string, siteId: string): Promise<string> {
  const expires = Date.now() + 86400000;
  const data = `${siteId}.${expires}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.${btoa(
    String.fromCharCode(...new Uint8Array(signature)),
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')}`;
}
async function validAccessToken(
  c: Context<{ Bindings: Env }>,
  siteId: string,
  secret: string,
): Promise<boolean> {
  const token = readCookie(c, 'wk_public_access');
  if (!token) return false;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return false;
  try {
    const data = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    const [tokenSite, expires] = data.split('.');
    if (tokenSite !== siteId || Number(expires) < Date.now()) return false;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const bytes = Uint8Array.from(
      atob(signature.replace(/-/g, '+').replace(/_/g, '/')),
      (character) => character.charCodeAt(0),
    );
    return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(data));
  } catch {
    return false;
  }
}

function projectFromRows(
  record: typeof site.$inferSelect,
  rows: Array<typeof page.$inferSelect>,
): WebKilnProject {
  return {
    schemaVersion: 2,
    site: { id: record.id, title: record.name, description: '', language: 'en', timezone: 'UTC' },
    pages: rows.map((item) => ({
      id: item.id,
      name: item.name,
      slug: item.slug,
      projectData: JSON.parse(item.projectData),
      updatedAt: new Date(item.updatedAt).toISOString(),
      isHomepage: item.homepage,
      seo: {
        title: item.seoTitle,
        description: item.seoDescription,
        canonical: item.canonicalUrl ?? undefined,
      },
      settings: {
        showInNavigation: item.showInNavigation,
        passwordProtected: item.passwordProtected,
      },
    })),
    deletedPages: [],
    currentPageId: rows.find((item) => item.homepage)?.id ?? rows[0]?.id ?? 'home',
    homepagePageId: rows.find((item) => item.homepage)?.id ?? rows[0]?.id ?? 'home',
    themeTokens: JSON.parse(record.themeData),
    assets: [],
    customCode: { html: '', css: '', javascript: '', isolated: true },
    revisions: [],
  };
}

function toPage(item: typeof page.$inferSelect) {
  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    projectData: JSON.parse(item.projectData),
    updatedAt: new Date(item.updatedAt).toISOString(),
    isHomepage: item.homepage,
    seo: {
      title: item.seoTitle,
      description: item.seoDescription,
      canonical: item.canonicalUrl ?? undefined,
    },
    settings: {
      showInNavigation: item.showInNavigation,
      passwordProtected: item.passwordProtected,
    },
  };
}
function toCloudSite(item: typeof site.$inferSelect, pageCount: number, user: { id: string }) {
  return {
    id: item.id,
    workspaceId: item.workspaceId,
    name: item.name,
    slug: item.slug,
    status: item.status,
    homepagePageId: item.homepagePageId,
    currentRevision: item.currentRevision,
    pageCount,
    updatedAt: new Date(item.updatedAt).toISOString(),
    updatedBy: user.id,
  };
}
function accessUser(record: { user: { id: string } }) {
  return record.user;
}
async function getSiteAccess(c: Context<{ Bindings: Env }>, role: 'viewer' | 'editor') {
  const user = await currentUser(c);
  if (!user)
    return { error: true, response: jsonError(c, 401, 'UNAUTHENTICATED', 'Sign in required') };
  const siteId = c.req.param('siteId');
  if (!siteId) return { error: true, response: jsonError(c, 404, 'NOT_FOUND', 'Site not found') };
  const record = await getDb(c.env.DB)
    .select({ site, membership: workspaceMembership })
    .from(site)
    .innerJoin(workspaceMembership, eq(site.workspaceId, workspaceMembership.workspaceId))
    .where(and(eq(site.id, siteId), eq(workspaceMembership.userId, user.id)))
    .get();
  if (!record) return { error: true, response: jsonError(c, 404, 'NOT_FOUND', 'Site not found') };
  const editorRoles = ['owner', 'admin', 'editor'];
  if (role === 'editor' && !editorRoles.includes(record.membership.role))
    return { error: true, response: jsonError(c, 403, 'FORBIDDEN', 'Editor access required') };
  return { ...record, user };
}

app.onError((error, c) => {
  console.error(JSON.stringify({ event: 'worker_error', message: error.message }));
  return jsonError(c, 500, 'INTERNAL_FAILURE', 'The request could not be completed');
});
export default app;
