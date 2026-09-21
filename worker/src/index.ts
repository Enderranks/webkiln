import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { getAuth } from './auth';
import { getDb } from './db/client';
import {
  auditEvent,
  assetMetadata,
  authRateLimit,
  collaborationInvite,
  pagePermission,
  reviewComment,
  approvalRequest,
  reviewLink,
  cmsCollection,
  cmsField,
  cmsRecord,
  formDefinition,
  formSubmission,
  automation,
  automationExecution,
  page,
  publishedRelease,
  publishedSite,
  site,
  siteRevision,
  workspace,
  workspaceMembership,
} from './db/schema';
import type { Env } from './env';
import { canonicalRole, currentUser, requireMembership, roleAllows } from './security';
import {
  createPublishedSnapshot,
  hashPassword,
  normalizeSlug,
  publicHtml,
  publicRobots,
  publicInteractionRuntime,
  formatPublicValue,
  type PublishedSnapshot,
} from './publishing';
import type { WebKilnProject } from '../../src/types';

const app = new Hono<{ Bindings: Env }>();
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_FORM_BYTES = 512 * 1024;
const AUTOMATION_TRIGGERS = new Set([
  'form.submitted',
  'site.published',
  'site.unpublished',
  'collection.record_created',
  'collection.record_updated',
  'revision.created',
]);
const AUTOMATION_ACTIONS = new Set([
  'store-submission',
  'create-record',
  'update-record',
  'add-notification',
  'call-webhook',
  'change-banner',
  'log-event',
]);
function validateAutomationInput(graph: unknown, retryPolicy?: unknown): string | null {
  if (!graph || typeof graph !== 'object') return 'An automation graph is required';
  const value = graph as { conditions?: unknown; actions?: unknown };
  if (!Array.isArray(value.conditions) || !Array.isArray(value.actions))
    return 'Automation conditions and actions are required';
  if (value.conditions.length > 10 || value.actions.length > 10)
    return 'Automations are limited to 10 conditions and 10 actions';
  if (
    value.conditions.some(
      (item) =>
        !item ||
        typeof item !== 'object' ||
        typeof (item as { field?: unknown }).field !== 'string' ||
        !(item as { field: string }).field.trim() ||
        typeof (item as { operator?: unknown }).operator !== 'string' ||
        !(item as { operator: string }).operator.trim(),
    )
  )
    return 'Each condition needs a field and operator';
  if (
    value.actions.some(
      (item) =>
        !item ||
        typeof item !== 'object' ||
        typeof (item as { type?: unknown }).type !== 'string' ||
        !AUTOMATION_ACTIONS.has((item as { type: string }).type),
    )
  )
    return 'Each action must use an approved action type';
  if (retryPolicy !== undefined) {
    if (!retryPolicy || typeof retryPolicy !== 'object') return 'Retry policy is invalid';
    const policy = retryPolicy as { maxAttempts?: unknown; backoffSeconds?: unknown };
    if (
      typeof policy.maxAttempts !== 'number' ||
      !Number.isInteger(policy.maxAttempts) ||
      policy.maxAttempts < 0 ||
      policy.maxAttempts > 5 ||
      typeof policy.backoffSeconds !== 'number' ||
      !Number.isInteger(policy.backoffSeconds) ||
      policy.backoffSeconds < 0 ||
      policy.backoffSeconds > 3600
    )
      return 'Retry policy must use 0–5 attempts and 0–3600 seconds backoff';
  }
  return null;
}
const jsonError = (
  c: Context<{ Bindings: Env }>,
  status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500,
  code: string,
  message: string,
) => c.json({ error: { code, message } }, status);

app.use('*', async (c, next) => {
  const requestId = c.req.header('x-request-id')?.slice(0, 80) || crypto.randomUUID();
  c.header('x-request-id', requestId);
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://webkiln-v10-api-dev.underline-dev.workers.dev; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  const method = c.req.method.toUpperCase();
  const pathname = new URL(c.req.url).pathname;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && pathname.startsWith('/api/')) {
    const origin = c.req.header('origin');
    if (origin && origin !== c.env.APP_ORIGIN)
      return jsonError(c, 403, 'ORIGIN_REJECTED', 'Request origin is not allowed');
    const contentLength = Number(c.req.header('content-length') ?? 0);
    const limit = pathname.startsWith('/api/forms/') ? MAX_FORM_BYTES : MAX_JSON_BYTES;
    if (contentLength > limit)
      return jsonError(c, 413, 'PAYLOAD_TOO_LARGE', 'Request payload exceeds the allowed limit');
  }
  await next();
  const response = c.res;
  if (pathname.startsWith('/api/')) response.headers.set('Cache-Control', 'no-store');
  console.log(
    JSON.stringify({ event: 'request', requestId, method, pathname, status: response.status }),
  );
  return response;
});
const cmsFieldTypes = new Set([
  'text',
  'rich-text',
  'number',
  'boolean',
  'date',
  'url',
  'image',
  'select',
  'multi-select',
  'reference',
  'slug',
]);
const safeRichText = (value: unknown) =>
  typeof value === 'string'
    ? value
        .replace(/<((script|iframe|object|embed|style|form|link|meta))[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<\/?(script|iframe|object|embed|style|form|link|meta)[^>]*>/gi, '')
        .replace(/\s(on\w+|javascript:)\s*=\s*(['"]).*?\2/gi, '')
    : value;
const jsonValue = (value: string | null | undefined, fallback: unknown) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

async function cmsAccess(
  c: Context<{ Bindings: Env }>,
  collectionId: string,
  role: 'viewer' | 'editor',
) {
  const user = await currentUser(c);
  if (!user)
    return { error: true, response: jsonError(c, 401, 'UNAUTHENTICATED', 'Sign in required') };
  const item = await getDb(c.env.DB)
    .select({ collection: cmsCollection, membership: workspaceMembership })
    .from(cmsCollection)
    .innerJoin(workspaceMembership, eq(cmsCollection.workspaceId, workspaceMembership.workspaceId))
    .where(and(eq(cmsCollection.id, collectionId), eq(workspaceMembership.userId, user.id)))
    .get();
  if (!item)
    return { error: true, response: jsonError(c, 404, 'NOT_FOUND', 'Collection not found') };
  if (role === 'editor' && !roleAllows(item.membership.role, 'content'))
    return { error: true, response: jsonError(c, 403, 'FORBIDDEN', 'Editor access required') };
  return { ...item, user };
}
async function authRequestAllowed(c: Context<{ Bindings: Env }>): Promise<boolean> {
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
  const key = `auth:${ip.slice(0, 120)}:${new URL(c.req.url).pathname}`;
  const windowStart = Math.floor(Date.now() / 60000);
  const db = getDb(c.env.DB);
  const current = await db.select().from(authRateLimit).where(eq(authRateLimit.key, key)).get();
  const count = current?.windowStart === windowStart ? current.count + 1 : 1;
  if (count > 10) return false;
  const now = new Date();
  if (current)
    await db
      .update(authRateLimit)
      .set({ windowStart, count, updatedAt: now })
      .where(eq(authRateLimit.key, key));
  else await db.insert(authRateLimit).values({ key, windowStart, count, updatedAt: now });
  return true;
}
function serializeCollection(
  item: typeof cmsCollection.$inferSelect,
  fields: (typeof cmsField.$inferSelect)[],
) {
  return {
    ...item,
    permissions: jsonValue(item.permissions, { read: 'published', write: 'editor' }),
    fields: fields
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((field) => ({
        ...field,
        unique: field.isUnique,
        validation: jsonValue(field.validation, {}),
        options: jsonValue(field.options, []),
      })),
  };
}
function validateRecord(fields: (typeof cmsField.$inferSelect)[], data: Record<string, unknown>) {
  for (const field of fields) {
    const value =
      data[field.slug] ??
      (field.defaultValue ? jsonValue(field.defaultValue, field.defaultValue) : undefined);
    if (field.required && (value === undefined || value === null || value === ''))
      return `Field "${field.name}" is required`;
    if (value === undefined || value === null || value === '') continue;
    if (field.type === 'number' && typeof value !== 'number')
      return `Field "${field.name}" must be a number`;
    if (field.type === 'boolean' && typeof value !== 'boolean')
      return `Field "${field.name}" must be boolean`;
    if (field.type === 'url' && (typeof value !== 'string' || !/^https?:\/\//i.test(value)))
      return `Field "${field.name}" must be an http(s) URL`;
    if (field.type === 'reference' && typeof value !== 'string')
      return `Field "${field.name}" must reference a record id`;
    if (field.type === 'rich-text') data[field.slug] = safeRichText(value);
  }
  return null;
}
async function validateReferences(
  db: ReturnType<typeof getDb>,
  fields: (typeof cmsField.$inferSelect)[],
  data: Record<string, unknown>,
  workspaceId: string,
) {
  for (const field of fields.filter(
    (item) => item.type === 'reference' && item.referenceCollectionId,
  )) {
    const value = data[field.slug];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'string')
      return `Reference field "${field.name}" must contain a record id`;
    const target = await db
      .select()
      .from(cmsRecord)
      .where(
        and(
          eq(cmsRecord.id, value),
          eq(cmsRecord.workspaceId, workspaceId),
          eq(cmsRecord.collectionId, field.referenceCollectionId!),
        ),
      )
      .get();
    if (!target) return `Reference field "${field.name}" points to an unavailable record`;
  }
  return null;
}
const formFieldTypes = new Set([
  'text',
  'email',
  'phone',
  'number',
  'date',
  'time',
  'select',
  'checkbox',
  'radio',
  'textarea',
  'consent',
  'hidden',
]);
function validateFormPayload(
  fields: Array<{
    name?: string;
    type?: string;
    required?: boolean;
    options?: string[];
    validation?: Record<string, unknown>;
    conditional?: { field?: string; equals?: string };
  }>,
  data: Record<string, unknown>,
) {
  for (const field of fields) {
    const value = data[field.name ?? ''];
    if (
      field.conditional?.field &&
      String(data[field.conditional.field] ?? '') !== String(field.conditional.equals ?? '')
    )
      continue;
    if (field.required && (value === undefined || value === null || value === ''))
      return `${field.name} is required`;
    if (value === undefined || value === null || value === '') continue;
    if (
      field.type === 'email' &&
      (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    )
      return `${field.name} must be a valid email`;
    if (field.type === 'number' && typeof value !== 'number' && Number.isNaN(Number(value)))
      return `${field.name} must be a number`;
    if (['select', 'radio'].includes(field.type ?? '') && !field.options?.includes(String(value)))
      return `${field.name} has an invalid option`;
    if (field.type === 'consent' && value !== true && value !== 'true')
      return `${field.name} must be accepted`;
    const pattern = field.validation?.pattern;
    if (typeof pattern === 'string' && typeof value === 'string') {
      try {
        if (!new RegExp(pattern).test(value)) return `${field.name} has an invalid format`;
      } catch {
        return `${field.name} has an invalid validation rule`;
      }
    }
  }
  return null;
}
function formResponse(row: typeof formDefinition.$inferSelect) {
  return { ...row, fields: jsonValue(row.fields, []), settings: jsonValue(row.settings, {}) };
}
function automationResponse(row: typeof automation.$inferSelect) {
  return {
    ...row,
    graph: jsonValue(row.graph, { conditions: [], actions: [] }),
    retryPolicy: jsonValue(row.retryPolicy, { maxAttempts: 3, backoffSeconds: 10 }),
  };
}
async function runAutomations(
  c: Context<{ Bindings: Env }>,
  workspaceId: string,
  triggerType: string,
  eventId: string,
  payload: Record<string, unknown>,
) {
  const db = getDb(c.env.DB);
  const flows = await db
    .select()
    .from(automation)
    .where(
      and(
        eq(automation.workspaceId, workspaceId),
        eq(automation.triggerType, triggerType),
        eq(automation.status, 'enabled'),
      ),
    )
    .limit(50)
    .all();
  for (const flow of flows) {
    const key = `${triggerType}:${eventId}`;
    const existing = await db
      .select()
      .from(automationExecution)
      .where(
        and(
          eq(automationExecution.automationId, flow.id),
          eq(automationExecution.idempotencyKey, key),
        ),
      )
      .get();
    if (existing) continue;
    const executionId = crypto.randomUUID();
    const now = new Date();
    await db.insert(automationExecution).values({
      id: executionId,
      automationId: flow.id,
      workspaceId,
      eventId,
      idempotencyKey: key,
      status: 'running',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });
    const graph = jsonValue(flow.graph, { conditions: [], actions: [] }) as {
      conditions?: Array<{ field: string; operator: string; value?: string }>;
      actions?: Array<{ type: string; config: Record<string, unknown> }>;
    };
    const conditionsPass = (graph.conditions ?? []).every((condition) => {
      const actual = String(payload[condition.field] ?? '');
      if (condition.operator === 'equals') return actual === String(condition.value ?? '');
      if (condition.operator === 'contains') return actual.includes(String(condition.value ?? ''));
      if (condition.operator === 'exists') return Boolean(actual);
      return false;
    });
    if (!conditionsPass) {
      await db
        .update(automationExecution)
        .set({ status: 'skipped', updatedAt: new Date() })
        .where(eq(automationExecution.id, executionId));
      continue;
    }
    const retry = jsonValue(flow.retryPolicy, { maxAttempts: 3 }) as { maxAttempts?: number };
    let attempts = 0;
    let error: string | null = null;
    let succeeded = false;
    while (!succeeded && attempts < Math.max(1, Math.min(3, retry.maxAttempts ?? 3))) {
      attempts += 1;
      try {
        for (const action of graph.actions ?? []) {
          if (action.type === 'store-submission') {
            if (!payload.submissionId) throw new Error('No form submission is available to store');
            continue;
          }
          if (action.type === 'log-event') {
            await db.insert(auditEvent).values({
              id: crypto.randomUUID(),
              workspaceId,
              userId: flow.createdBy,
              action: 'automation.event_logged',
              resourceType: 'automation',
              resourceId: flow.id,
              metadata: JSON.stringify({
                triggerType,
                eventId,
                label: String(action.config?.value ?? 'Automation event'),
              }),
              createdAt: new Date(),
            });
            continue;
          }
          if (action.type === 'call-webhook') {
            const url = String(action.config.url ?? '');
            if (!/^https:\/\//i.test(url))
              throw new Error('Approved webhook requires an https URL');
            await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-WebKiln-Event': triggerType },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(5000),
            });
            continue;
          }
          throw new Error(`Action ${action.type} is not available in this environment`);
        }
        succeeded = true;
      } catch (caught) {
        error = caught instanceof Error ? caught.message : 'Automation action failed';
      }
    }
    await db
      .update(automationExecution)
      .set({ status: succeeded ? 'succeeded' : 'failed', attempts, error, updatedAt: new Date() })
      .where(eq(automationExecution.id, executionId));
  }
}

app.use('/api/auth/*', async (c, next) => {
  const response = await cors({
    origin: c.env.APP_ORIGIN,
    credentials: true,
    allowHeaders: ['Content-Type'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  })(c, next);
  return response;
});
app.all('/api/auth/*', async (c) => {
  const path = new URL(c.req.url).pathname;
  if (
    c.req.method === 'POST' &&
    /(sign-in|sign-up|password-reset)/i.test(path) &&
    !(await authRequestAllowed(c))
  )
    return jsonError(c, 429, 'RATE_LIMITED', 'Too many authentication attempts; try again shortly');
  return getAuth(c.env).handler(c.req.raw);
});
app.get('/api/health', (c) => c.json({ ok: true, environment: c.env.ENVIRONMENT, database: 'd1' }));

app.get(
  '/api/webkiln-runtime.js',
  () =>
    new Response(publicInteractionRuntime(), {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'Content-Security-Policy': "default-src 'none'; script-src 'self'",
        'X-Content-Type-Options': 'nosniff',
      },
    }),
);

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

app.get('/api/workspaces/:workspaceId/collections', async (c) => {
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
  const db = getDb(c.env.DB);
  const collections = await db
    .select()
    .from(cmsCollection)
    .where(eq(cmsCollection.workspaceId, c.req.param('workspaceId')))
    .orderBy(asc(cmsCollection.name))
    .all();
  const fields = await db.select().from(cmsField).all();
  return c.json(
    collections.map((item) =>
      serializeCollection(
        item,
        fields.filter((field) => field.collectionId === item.id),
      ),
    ),
  );
});

app.post('/api/workspaces/:workspaceId/collections', async (c) => {
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
  const body = await c.req.json<{
    name?: string;
    fields?: Array<{
      name?: string;
      slug?: string;
      type?: string;
      required?: boolean;
      unique?: boolean;
      defaultValue?: unknown;
      validation?: Record<string, unknown>;
      options?: string[];
      referenceCollectionId?: string;
    }>;
  }>();
  const name = body.name?.trim();
  if (!name || !Array.isArray(body.fields) || body.fields.length > 50)
    return jsonError(
      c,
      400,
      'VALIDATION_ERROR',
      'Collection name and up to 50 fields are required',
    );
  const fields = body.fields.map((field, index) => ({
    ...field,
    name: field.name?.trim(),
    slug:
      field.slug?.trim() ||
      field.name
        ?.trim()
        ?.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-'),
    type: field.type ?? 'text',
    index,
  }));
  if (fields.some((field) => !field.name || !field.slug || !cmsFieldTypes.has(field.type ?? '')))
    return jsonError(
      c,
      400,
      'VALIDATION_ERROR',
      'Every field needs a name, slug, and supported type',
    );
  if (new Set(fields.map((field) => field.slug)).size !== fields.length)
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Field slugs must be unique');
  const id = crypto.randomUUID();
  const now = new Date();
  const slug = `${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-${id.slice(0, 6)}`;
  const db = getDb(c.env.DB);
  await db.insert(cmsCollection).values({
    id,
    workspaceId: c.req.param('workspaceId'),
    name,
    slug,
    createdBy: access.user.id,
    createdAt: now,
    updatedAt: now,
  });
  for (const field of fields)
    await db.insert(cmsField).values({
      id: crypto.randomUUID(),
      collectionId: id,
      name: field.name!,
      slug: field.slug!,
      type: field.type!,
      required: Boolean(field.required),
      isUnique: Boolean(field.unique),
      defaultValue: field.defaultValue === undefined ? null : JSON.stringify(field.defaultValue),
      validation: JSON.stringify(field.validation ?? {}),
      options: JSON.stringify(field.options ?? []),
      referenceCollectionId: field.referenceCollectionId ?? null,
      sortOrder: field.index,
      createdAt: now,
      updatedAt: now,
    });
  const collection = await db.select().from(cmsCollection).where(eq(cmsCollection.id, id)).get();
  const createdFields = await db.select().from(cmsField).where(eq(cmsField.collectionId, id)).all();
  return c.json(serializeCollection(collection!, createdFields), 201);
});

app.get('/api/sites/:siteId/forms', async (c) => {
  const record = await getSiteAccess(c, 'viewer');
  if ('error' in record) return record.response;
  const rows = await getDb(c.env.DB)
    .select()
    .from(formDefinition)
    .where(eq(formDefinition.siteId, record.site.id))
    .orderBy(asc(formDefinition.name))
    .all();
  return c.json(rows.map(formResponse));
});

app.post('/api/sites/:siteId/forms', async (c) => {
  const record = await getSiteAccess(c, 'editor');
  if ('error' in record) return record.response;
  const body = await c.req.json<{
    name?: string;
    fields?: Array<{
      id?: string;
      name?: string;
      type?: string;
      label?: string;
      required?: boolean;
      options?: string[];
      validation?: Record<string, unknown>;
      conditional?: { field: string; equals: string };
      step?: number;
    }>;
    settings?: Record<string, unknown>;
  }>();
  const name = body.name?.trim();
  const fields = body.fields ?? [];
  if (
    !name ||
    fields.length > 100 ||
    fields.some((field) => !field.name || !formFieldTypes.has(field.type ?? ''))
  )
    return jsonError(c, 400, 'VALIDATION_ERROR', 'A form name and supported fields are required');
  const ids = fields.map((field) => field.name!);
  if (new Set(ids).size !== ids.length)
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Form field names must be unique');
  const fieldNames = new Set(ids);
  if (
    fields.some(
      (field) =>
        field.step !== undefined &&
        (!Number.isInteger(field.step) || field.step < 1 || field.step > 20),
    ) ||
    fields.some(
      (field) =>
        field.conditional &&
        (!field.conditional.field ||
          !field.conditional.equals ||
          field.conditional.field === field.name ||
          !fieldNames.has(field.conditional.field ?? '')),
    )
  )
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Form field steps and conditions are invalid');
  const id = crypto.randomUUID();
  const now = new Date();
  const slug = `${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-${id.slice(0, 6)}`;
  await getDb(c.env.DB)
    .insert(formDefinition)
    .values({
      id,
      siteId: record.site.id,
      workspaceId: record.site.workspaceId,
      name,
      slug,
      fields: JSON.stringify(
        fields.map((field) => ({
          id: field.id ?? crypto.randomUUID(),
          name: field.name,
          type: field.type,
          label: field.label ?? field.name,
          required: Boolean(field.required),
          options: field.options ?? [],
          validation: field.validation ?? {},
          conditional: field.conditional,
          step: Number.isInteger(field.step) ? field.step : 1,
        })),
      ),
      settings: JSON.stringify({
        honeypot: true,
        successMessage: 'Thanks — your message has been received.',
        failureMessage: 'We could not save your submission.',
        submissionLimit: 100,
        ...(body.settings ?? {}),
      }),
      createdBy: record.user.id,
      createdAt: now,
      updatedAt: now,
    });
  return c.json(
    formResponse(
      (await getDb(c.env.DB).select().from(formDefinition).where(eq(formDefinition.id, id)).get())!,
    ),
    201,
  );
});

app.patch('/api/forms/:formId', async (c) => {
  const user = await currentUser(c);
  if (!user) return jsonError(c, 401, 'UNAUTHENTICATED', 'Sign in required');
  const row = await getDb(c.env.DB)
    .select({ form: formDefinition, membership: workspaceMembership })
    .from(formDefinition)
    .innerJoin(workspaceMembership, eq(formDefinition.workspaceId, workspaceMembership.workspaceId))
    .where(
      and(eq(formDefinition.id, c.req.param('formId')), eq(workspaceMembership.userId, user.id)),
    )
    .get();
  if (!row) return jsonError(c, 404, 'NOT_FOUND', 'Form not found');
  if (!roleAllows(row.membership.role, 'content'))
    return jsonError(c, 403, 'FORBIDDEN', 'Editor access required');
  const body = await c.req.json<{
    name?: string;
    fields?: Array<{
      id?: string;
      name?: string;
      type?: string;
      label?: string;
      required?: boolean;
      options?: string[];
      validation?: Record<string, unknown>;
      conditional?: { field: string; equals: string };
      step?: number;
    }>;
    settings?: Record<string, unknown>;
    status?: 'active' | 'archived';
  }>();
  const name = body.name?.trim() || row.form.name;
  const fields =
    body.fields ??
    (jsonValue(row.form.fields, []) as Array<{
      id?: string;
      name?: string;
      type?: string;
      label?: string;
      required?: boolean;
      options?: string[];
      validation?: Record<string, unknown>;
      conditional?: { field?: string; equals?: string };
      step?: number;
    }>);
  if (
    fields.length > 100 ||
    fields.some((field) => !field.name || !formFieldTypes.has(String(field.type ?? '')))
  )
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Form fields must use supported types');
  const ids = fields.map((field) => String(field.name));
  if (new Set(ids).size !== ids.length)
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Form field names must be unique');
  const fieldNames = new Set(ids);
  if (
    fields.some(
      (field) =>
        field.step !== undefined &&
        (!Number.isInteger(field.step) || Number(field.step) < 1 || Number(field.step) > 20),
    ) ||
    fields.some(
      (field) =>
        field.conditional &&
        (!String(field.conditional.field ?? '').trim() ||
          !String(field.conditional.equals ?? '').trim() ||
          field.conditional.field === field.name ||
          !fieldNames.has(field.conditional.field ?? '')),
    )
  )
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Form field steps and conditions are invalid');
  const now = new Date();
  await getDb(c.env.DB)
    .update(formDefinition)
    .set({
      name,
      fields: JSON.stringify(
        fields.map((field) => ({
          id: field.id ?? crypto.randomUUID(),
          name: field.name,
          type: field.type,
          label: field.label ?? field.name,
          required: Boolean(field.required),
          options: field.options ?? [],
          validation: field.validation ?? {},
          conditional: field.conditional,
          step: Number.isInteger(field.step) ? field.step : 1,
        })),
      ),
      settings: JSON.stringify({ ...jsonValue(row.form.settings, {}), ...(body.settings ?? {}) }),
      status: body.status ?? row.form.status,
      updatedAt: now,
    })
    .where(eq(formDefinition.id, row.form.id));
  return c.json(
    formResponse(
      (await getDb(c.env.DB)
        .select()
        .from(formDefinition)
        .where(eq(formDefinition.id, row.form.id))
        .get())!,
    ),
  );
});

app.get('/api/forms/:formId/submissions', async (c) => {
  const user = await currentUser(c);
  if (!user) return jsonError(c, 401, 'UNAUTHENTICATED', 'Sign in required');
  const row = await getDb(c.env.DB)
    .select({ form: formDefinition, membership: workspaceMembership })
    .from(formDefinition)
    .innerJoin(workspaceMembership, eq(formDefinition.workspaceId, workspaceMembership.workspaceId))
    .where(
      and(eq(formDefinition.id, c.req.param('formId')), eq(workspaceMembership.userId, user.id)),
    )
    .get();
  if (!row) return jsonError(c, 404, 'NOT_FOUND', 'Form not found');
  if (!roleAllows(row.membership.role, 'view'))
    return jsonError(c, 403, 'FORBIDDEN', 'Workspace access required');
  const status = c.req.query('status');
  const query = (c.req.query('q') ?? '').trim().toLowerCase();
  const submissions = await getDb(c.env.DB)
    .select()
    .from(formSubmission)
    .where(eq(formSubmission.formId, row.form.id))
    .orderBy(desc(formSubmission.createdAt))
    .limit(200)
    .all();
  const filtered = submissions.filter((submission) => {
    const data = jsonValue(submission.data, {}) as Record<string, unknown>;
    return (
      (!status || submission.status === status) &&
      (!query || JSON.stringify(data).toLowerCase().includes(query))
    );
  });
  return c.json(
    filtered.map((submission) => ({ ...submission, data: jsonValue(submission.data, {}) })),
  );
});

app.get('/api/forms/:formId/submissions/export', async (c) => {
  const user = await currentUser(c);
  if (!user) return jsonError(c, 401, 'UNAUTHENTICATED', 'Sign in required');
  const row = await getDb(c.env.DB)
    .select({ form: formDefinition, membership: workspaceMembership })
    .from(formDefinition)
    .innerJoin(workspaceMembership, eq(formDefinition.workspaceId, workspaceMembership.workspaceId))
    .where(
      and(eq(formDefinition.id, c.req.param('formId')), eq(workspaceMembership.userId, user.id)),
    )
    .get();
  if (!row || !roleAllows(row.membership.role, 'view'))
    return jsonError(c, 403, 'FORBIDDEN', 'Workspace access required');
  const rows = await getDb(c.env.DB)
    .select()
    .from(formSubmission)
    .where(eq(formSubmission.formId, row.form.id))
    .orderBy(desc(formSubmission.createdAt))
    .limit(200)
    .all();
  const dataRows = rows.map((item) => ({
    createdAt: item.createdAt.toISOString(),
    status: item.status,
    data: jsonValue(item.data, {}) as Record<string, unknown>,
  }));
  const keys = [...new Set(dataRows.flatMap((item) => Object.keys(item.data)))];
  const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [
    ['createdAt', 'status', ...keys].map(csvCell).join(','),
    ...dataRows.map((item) =>
      [item.createdAt, item.status, ...keys.map((key) => item.data[key])].map(csvCell).join(','),
    ),
  ].join('\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${row.form.slug}-submissions.csv"`,
    },
  });
});

app.patch('/api/forms/:formId/submissions/:submissionId', async (c) => {
  const user = await currentUser(c);
  if (!user) return jsonError(c, 401, 'UNAUTHENTICATED', 'Sign in required');
  const row = await getDb(c.env.DB)
    .select({ form: formDefinition, membership: workspaceMembership })
    .from(formDefinition)
    .innerJoin(workspaceMembership, eq(formDefinition.workspaceId, workspaceMembership.workspaceId))
    .where(
      and(eq(formDefinition.id, c.req.param('formId')), eq(workspaceMembership.userId, user.id)),
    )
    .get();
  if (!row || !roleAllows(row.membership.role, 'content'))
    return jsonError(c, 403, 'FORBIDDEN', 'Editor access required');
  const body = await c.req.json<{ status?: string }>();
  if (!body.status || !['received', 'read', 'archived'].includes(body.status))
    return jsonError(c, 400, 'VALIDATION_ERROR', 'A valid submission status is required');
  const updated = await getDb(c.env.DB)
    .update(formSubmission)
    .set({ status: body.status })
    .where(
      and(
        eq(formSubmission.id, c.req.param('submissionId')),
        eq(formSubmission.formId, row.form.id),
      ),
    )
    .returning()
    .get();
  if (!updated) return jsonError(c, 404, 'NOT_FOUND', 'Submission not found');
  return c.json({ ...updated, data: jsonValue(updated.data, {}) });
});

app.delete('/api/forms/:formId/submissions/:submissionId', async (c) => {
  const user = await currentUser(c);
  if (!user) return jsonError(c, 401, 'UNAUTHENTICATED', 'Sign in required');
  const row = await getDb(c.env.DB)
    .select({ form: formDefinition, membership: workspaceMembership })
    .from(formDefinition)
    .innerJoin(workspaceMembership, eq(formDefinition.workspaceId, workspaceMembership.workspaceId))
    .where(
      and(eq(formDefinition.id, c.req.param('formId')), eq(workspaceMembership.userId, user.id)),
    )
    .get();
  if (!row || !roleAllows(row.membership.role, 'content'))
    return jsonError(c, 403, 'FORBIDDEN', 'Editor access required');
  await getDb(c.env.DB)
    .delete(formSubmission)
    .where(
      and(
        eq(formSubmission.id, c.req.param('submissionId')),
        eq(formSubmission.formId, row.form.id),
      ),
    );
  return c.body(null, 204);
});

app.post('/api/forms/:formId/submit', async (c) => {
  const row = await getDb(c.env.DB)
    .select({ form: formDefinition, site })
    .from(formDefinition)
    .innerJoin(site, eq(formDefinition.siteId, site.id))
    .where(eq(formDefinition.id, c.req.param('formId')))
    .get();
  if (!row || row.form.status !== 'active') return jsonError(c, 404, 'NOT_FOUND', 'Form not found');
  const published = await getDb(c.env.DB)
    .select()
    .from(publishedSite)
    .where(eq(publishedSite.siteId, row.site.id))
    .get();
  if (!published?.currentReleaseId) return jsonError(c, 404, 'NOT_FOUND', 'Form is not available');
  const body = await c.req.json<Record<string, unknown>>();
  const settings = jsonValue(row.form.settings, {}) as {
    honeypot?: boolean;
    submissionLimit?: number;
    successMessage?: string;
    failureMessage?: string;
  };
  if (settings.honeypot !== false && body._website)
    return c.json({ ok: true, message: settings.successMessage ?? 'Thanks.' });
  const fields = jsonValue(row.form.fields, []) as Array<{
    name?: string;
    type?: string;
    required?: boolean;
    options?: string[];
    validation?: Record<string, unknown>;
    conditional?: { field?: string; equals?: string };
  }>;
  const validation = validateFormPayload(fields, body);
  if (validation) return jsonError(c, 400, 'VALIDATION_ERROR', validation);
  const idempotencyKey = c.req.header('Idempotency-Key') ?? null;
  const db = getDb(c.env.DB);
  if (idempotencyKey) {
    const previous = await db
      .select()
      .from(formSubmission)
      .where(
        and(
          eq(formSubmission.formId, row.form.id),
          eq(formSubmission.idempotencyKey, idempotencyKey),
        ),
      )
      .get();
    if (previous) return c.json({ ok: true, submissionId: previous.id, duplicate: true });
  }
  const recent = await db
    .select()
    .from(formSubmission)
    .where(eq(formSubmission.formId, row.form.id))
    .orderBy(desc(formSubmission.createdAt))
    .limit(Math.min(100, Number(settings.submissionLimit ?? 100)))
    .all();
  if (
    recent.length >= Number(settings.submissionLimit ?? 100) &&
    recent[recent.length - 1] &&
    Date.now() - recent[recent.length - 1].createdAt.getTime() < 86400000
  )
    return jsonError(c, 429, 'RATE_LIMITED', 'Submission limit reached');
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(formSubmission).values({
    id,
    formId: row.form.id,
    siteId: row.site.id,
    workspaceId: row.site.workspaceId,
    data: JSON.stringify(body),
    status: 'received',
    idempotencyKey,
    createdAt: now,
  });
  await runAutomations(c, row.site.workspaceId, 'form.submitted', id, {
    formId: row.form.id,
    submissionId: id,
    data: body,
  });
  return c.json(
    {
      ok: true,
      submissionId: id,
      message: settings.successMessage ?? 'Thanks — your submission has been received.',
    },
    201,
  );
});

app.get('/api/workspaces/:workspaceId/automations', async (c) => {
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
    .from(automation)
    .where(eq(automation.workspaceId, c.req.param('workspaceId')))
    .orderBy(desc(automation.updatedAt))
    .all();
  return c.json(rows.map(automationResponse));
});
app.post('/api/workspaces/:workspaceId/automations', async (c) => {
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
  const body = await c.req.json<{
    name?: string;
    triggerType?: string;
    graph?: { conditions?: unknown[]; actions?: unknown[] };
  }>();
  if (!body.name?.trim() || !body.triggerType || !AUTOMATION_TRIGGERS.has(body.triggerType))
    return jsonError(
      c,
      400,
      'VALIDATION_ERROR',
      'Automation name and supported trigger are required',
    );
  const graph = {
    conditions: body.graph?.conditions ?? [],
    actions: body.graph?.actions ?? [],
  };
  const graphError = validateAutomationInput(graph);
  if (graphError) return jsonError(c, 400, 'VALIDATION_ERROR', graphError);
  const id = crypto.randomUUID();
  const now = new Date();
  await getDb(c.env.DB)
    .insert(automation)
    .values({
      id,
      workspaceId: c.req.param('workspaceId'),
      name: body.name.trim(),
      triggerType: body.triggerType,
      graph: JSON.stringify(graph),
      status: 'draft',
      createdBy: access.user.id,
      createdAt: now,
      updatedAt: now,
    });
  return c.json(
    automationResponse(
      (await getDb(c.env.DB).select().from(automation).where(eq(automation.id, id)).get())!,
    ),
    201,
  );
});
app.patch('/api/automations/:automationId', async (c) => {
  const user = await currentUser(c);
  if (!user) return jsonError(c, 401, 'UNAUTHENTICATED', 'Sign in required');
  const row = await getDb(c.env.DB)
    .select({ flow: automation, membership: workspaceMembership })
    .from(automation)
    .innerJoin(workspaceMembership, eq(automation.workspaceId, workspaceMembership.workspaceId))
    .where(
      and(eq(automation.id, c.req.param('automationId')), eq(workspaceMembership.userId, user.id)),
    )
    .get();
  if (!row) return jsonError(c, 404, 'NOT_FOUND', 'Automation not found');
  if (!roleAllows(row.membership.role, 'design'))
    return jsonError(c, 403, 'FORBIDDEN', 'Editor access required');
  const body = await c.req.json<{
    name?: string;
    status?: 'draft' | 'enabled' | 'disabled';
    graph?: unknown;
    retryPolicy?: unknown;
  }>();
  if (
    body.status === 'enabled' &&
    row.flow.triggerType === 'form.submitted' &&
    !body.graph &&
    !row.flow.graph
  )
    return jsonError(c, 400, 'VALIDATION_ERROR', 'An automation graph is required');
  if (body.graph) {
    const graphError = validateAutomationInput(body.graph, body.retryPolicy);
    if (graphError) return jsonError(c, 400, 'VALIDATION_ERROR', graphError);
  } else if (body.retryPolicy !== undefined) {
    const retryError = validateAutomationInput(row.flow.graph, body.retryPolicy);
    if (retryError) return jsonError(c, 400, 'VALIDATION_ERROR', retryError);
  }
  await getDb(c.env.DB)
    .update(automation)
    .set({
      ...(body.name?.trim() ? { name: body.name.trim() } : {}),
      ...(body.status ? { status: body.status } : {}),
      ...(body.graph ? { graph: JSON.stringify(body.graph) } : {}),
      ...(body.retryPolicy ? { retryPolicy: JSON.stringify(body.retryPolicy) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(automation.id, row.flow.id));
  return c.json(
    automationResponse(
      (await getDb(c.env.DB)
        .select()
        .from(automation)
        .where(eq(automation.id, row.flow.id))
        .get())!,
    ),
  );
});
app.get('/api/automations/:automationId/executions', async (c) => {
  const user = await currentUser(c);
  if (!user) return jsonError(c, 401, 'UNAUTHENTICATED', 'Sign in required');
  const row = await getDb(c.env.DB)
    .select({ flow: automation, membership: workspaceMembership })
    .from(automation)
    .innerJoin(workspaceMembership, eq(automation.workspaceId, workspaceMembership.workspaceId))
    .where(
      and(eq(automation.id, c.req.param('automationId')), eq(workspaceMembership.userId, user.id)),
    )
    .get();
  if (!row) return jsonError(c, 404, 'NOT_FOUND', 'Automation not found');
  if (!roleAllows(row.membership.role, 'view'))
    return jsonError(c, 403, 'FORBIDDEN', 'Workspace access required');
  return c.json(
    await getDb(c.env.DB)
      .select()
      .from(automationExecution)
      .where(eq(automationExecution.automationId, row.flow.id))
      .orderBy(desc(automationExecution.createdAt))
      .limit(100)
      .all(),
  );
});

app.get('/api/collections/:collectionId/records', async (c) => {
  const access = await cmsAccess(c, c.req.param('collectionId'), 'viewer');
  if ('error' in access) return access.response;
  const pageNumber = Math.max(1, Math.min(10000, Number(c.req.query('page') ?? '1') || 1));
  const pageSize = Math.max(1, Math.min(100, Number(c.req.query('pageSize') ?? '25') || 25));
  const status =
    c.req.query('status') === 'published'
      ? 'published'
      : c.req.query('status') === 'draft'
        ? 'draft'
        : undefined;
  const search = c.req.query('search')?.trim().toLowerCase();
  const fields = await getDb(c.env.DB)
    .select()
    .from(cmsField)
    .where(eq(cmsField.collectionId, access.collection.id))
    .all();
  const rows = await getDb(c.env.DB)
    .select()
    .from(cmsRecord)
    .where(
      and(
        eq(cmsRecord.collectionId, access.collection.id),
        ...(status ? [eq(cmsRecord.status, status)] : []),
      ),
    )
    .orderBy(desc(cmsRecord.updatedAt))
    .limit(1000)
    .all();
  const filtered = rows.filter(
    (row) =>
      !search ||
      row.slug.toLowerCase().includes(search) ||
      JSON.stringify(row.data).toLowerCase().includes(search),
  );
  const records = filtered
    .slice((pageNumber - 1) * pageSize, pageNumber * pageSize)
    .map((row) => ({ ...row, data: jsonValue(row.data, {}) }));
  void fields;
  return c.json({ records, page: pageNumber, pageSize, total: filtered.length });
});

app.post('/api/collections/:collectionId/records', async (c) => {
  const access = await cmsAccess(c, c.req.param('collectionId'), 'editor');
  if ('error' in access) return access.response;
  const body = await c.req.json<{
    data?: Record<string, unknown>;
    status?: 'draft' | 'published';
    slug?: string;
  }>();
  const fields = await getDb(c.env.DB)
    .select()
    .from(cmsField)
    .where(eq(cmsField.collectionId, access.collection.id))
    .all();
  const data = { ...(body.data ?? {}) };
  const validation = validateRecord(fields, data);
  if (validation) return jsonError(c, 400, 'VALIDATION_ERROR', validation);
  const referenceError = await validateReferences(
    getDb(c.env.DB),
    fields,
    data,
    access.collection.workspaceId,
  );
  if (referenceError) return jsonError(c, 400, 'VALIDATION_ERROR', referenceError);
  const id = crypto.randomUUID();
  const now = new Date();
  const slug = body.slug?.trim() || String(data.slug ?? id.slice(0, 8));
  if (body.status === 'published' && validation)
    return jsonError(c, 400, 'VALIDATION_ERROR', validation);
  await getDb(c.env.DB)
    .insert(cmsRecord)
    .values({
      id,
      collectionId: access.collection.id,
      workspaceId: access.collection.workspaceId,
      slug,
      data: JSON.stringify(data),
      status: body.status === 'published' ? 'published' : 'draft',
      createdBy: access.user.id,
      createdAt: now,
      updatedAt: now,
    });
  await runAutomations(c, access.collection.workspaceId, 'collection.record_created', id, {
    collectionId: access.collection.id,
    recordId: id,
    slug,
    status: body.status === 'published' ? 'published' : 'draft',
    data,
  });
  return c.json(
    {
      id,
      collectionId: access.collection.id,
      workspaceId: access.collection.workspaceId,
      slug,
      data,
      status: body.status === 'published' ? 'published' : 'draft',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    201,
  );
});

app.patch('/api/records/:recordId', async (c) => {
  const user = await currentUser(c);
  if (!user) return jsonError(c, 401, 'UNAUTHENTICATED', 'Sign in required');
  const row = await getDb(c.env.DB)
    .select({ record: cmsRecord, membership: workspaceMembership })
    .from(cmsRecord)
    .innerJoin(workspaceMembership, eq(cmsRecord.workspaceId, workspaceMembership.workspaceId))
    .where(and(eq(cmsRecord.id, c.req.param('recordId')), eq(workspaceMembership.userId, user.id)))
    .get();
  if (!row) return jsonError(c, 404, 'NOT_FOUND', 'Record not found');
  if (!roleAllows(row.membership.role, 'content'))
    return jsonError(c, 403, 'FORBIDDEN', 'Editor access required');
  const body = await c.req.json<{
    data?: Record<string, unknown>;
    status?: 'draft' | 'published';
  }>();
  const fields = await getDb(c.env.DB)
    .select()
    .from(cmsField)
    .where(eq(cmsField.collectionId, row.record.collectionId))
    .all();
  const data = body.data ?? jsonValue(row.record.data, {});
  const validation = validateRecord(fields, data);
  if (validation) return jsonError(c, 400, 'VALIDATION_ERROR', validation);
  const referenceError = await validateReferences(
    getDb(c.env.DB),
    fields,
    data,
    row.record.workspaceId,
  );
  if (referenceError) return jsonError(c, 400, 'VALIDATION_ERROR', referenceError);
  const now = new Date();
  await getDb(c.env.DB)
    .update(cmsRecord)
    .set({
      data: JSON.stringify(data),
      status:
        body.status === 'published'
          ? 'published'
          : body.status === 'draft'
            ? 'draft'
            : row.record.status,
      updatedAt: now,
    })
    .where(eq(cmsRecord.id, row.record.id));
  await runAutomations(c, row.record.workspaceId, 'collection.record_updated', row.record.id, {
    collectionId: row.record.collectionId,
    recordId: row.record.id,
    slug: row.record.slug,
    status:
      body.status === 'published'
        ? 'published'
        : body.status === 'draft'
          ? 'draft'
          : row.record.status,
    data,
  });
  return c.json({
    ...row.record,
    data,
    status: body.status ?? row.record.status,
    updatedAt: now.toISOString(),
  });
});

app.delete('/api/records/:recordId', async (c) => {
  const user = await currentUser(c);
  if (!user) return jsonError(c, 401, 'UNAUTHENTICATED', 'Sign in required');
  const row = await getDb(c.env.DB)
    .select({ record: cmsRecord, membership: workspaceMembership })
    .from(cmsRecord)
    .innerJoin(workspaceMembership, eq(cmsRecord.workspaceId, workspaceMembership.workspaceId))
    .where(and(eq(cmsRecord.id, c.req.param('recordId')), eq(workspaceMembership.userId, user.id)))
    .get();
  if (!row) return jsonError(c, 404, 'NOT_FOUND', 'Record not found');
  if (!roleAllows(row.membership.role, 'content'))
    return jsonError(c, 403, 'FORBIDDEN', 'Editor access required');
  await getDb(c.env.DB).delete(cmsRecord).where(eq(cmsRecord.id, row.record.id));
  return c.body(null, 204);
});

app.get('/api/collections/:collectionId/export', async (c) => {
  const access = await cmsAccess(c, c.req.param('collectionId'), 'viewer');
  if ('error' in access) return access.response;
  const rows = await getDb(c.env.DB)
    .select()
    .from(cmsRecord)
    .where(eq(cmsRecord.collectionId, access.collection.id))
    .limit(1000)
    .all();
  const csv = [
    'id,slug,status,data',
    ...rows.map((row) =>
      [row.id, row.slug, row.status, JSON.stringify(row.data).replace(/"/g, '""')]
        .map((value) => `"${value}"`)
        .join(','),
    ),
  ].join('\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${access.collection.slug}.csv"`,
    },
  });
});

app.post('/api/collections/:collectionId/import', async (c) => {
  const access = await cmsAccess(c, c.req.param('collectionId'), 'editor');
  if ('error' in access) return access.response;
  const csv = await c.req.text();
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2 || lines.length > 101)
    return jsonError(c, 400, 'VALIDATION_ERROR', 'CSV must contain between 1 and 100 records');
  const headers = lines[0].split(',').map((header) => header.trim().replace(/^"|"$/g, ''));
  const fields = await getDb(c.env.DB)
    .select()
    .from(cmsField)
    .where(eq(cmsField.collectionId, access.collection.id))
    .all();
  const now = new Date();
  const created: unknown[] = [];
  for (const line of lines.slice(1)) {
    const values = line
      .split(',')
      .map((value) => value.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
    const data = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    const validation = validateRecord(fields, data);
    if (validation) return jsonError(c, 400, 'VALIDATION_ERROR', validation);
    const id = crypto.randomUUID();
    const slug = String(data.slug || id.slice(0, 8));
    await getDb(c.env.DB)
      .insert(cmsRecord)
      .values({
        id,
        collectionId: access.collection.id,
        workspaceId: access.collection.workspaceId,
        slug,
        data: JSON.stringify(data),
        status: 'draft',
        createdBy: access.user.id,
        createdAt: now,
        updatedAt: now,
      });
    created.push({ id, slug });
  }
  return c.json({ imported: created.length, records: created }, 201);
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
  const body = await c.req.json<{
    name?: string;
    status?: 'active' | 'archived';
    customDomain?: string | null;
  }>();
  const updates: {
    name?: string;
    status?: string;
    customDomain?: string | null;
    updatedBy: string;
    updatedAt: Date;
  } = {
    updatedBy: record.user.id,
    updatedAt: new Date(),
  };
  if (body.name?.trim()) updates.name = body.name.trim();
  if (body.status === 'active' || body.status === 'archived') updates.status = body.status;
  if (body.customDomain === null || typeof body.customDomain === 'string')
    updates.customDomain = body.customDomain?.trim() || null;
  await getDb(c.env.DB).update(site).set(updates).where(eq(site.id, record.site.id));
  return c.json({ ok: true });
});

app.post('/api/sites/:siteId/duplicate', async (c) => {
  const record = await getSiteAccess(c, 'editor');
  if ('error' in record) return record.response;
  const body = await c.req.json<{ name?: string }>();
  const id = crypto.randomUUID();
  const name = body.name?.trim() || `${record.site.name} copy`;
  const now = new Date();
  const db = getDb(c.env.DB);
  const pages = await db.select().from(page).where(eq(page.siteId, record.site.id)).all();
  await db.insert(site).values({
    id,
    workspaceId: record.site.workspaceId,
    name,
    slug: `${normalizeSlug(name)}-${id.slice(0, 6)}`,
    createdBy: record.user.id,
    updatedBy: record.user.id,
    themeData: record.site.themeData,
    editorSettings: record.site.editorSettings,
    settingsData: record.site.settingsData,
    customCodeMetadata: record.site.customCodeMetadata,
    createdAt: now,
    updatedAt: now,
  });
  for (const item of pages)
    await db
      .insert(page)
      .values({ ...item, id: crypto.randomUUID(), siteId: id, createdAt: now, updatedAt: now });
  return c.json(
    {
      ...toCloudSite(
        {
          ...record.site,
          id,
          name,
          slug: `${normalizeSlug(name)}-${id.slice(0, 6)}`,
          workspaceId: record.site.workspaceId,
          createdAt: now,
          updatedAt: now,
          createdBy: record.user.id,
          updatedBy: record.user.id,
          currentRevision: 0,
          status: 'active',
          customDomain: null,
        } as typeof site.$inferSelect,
        pages.length,
        record.user,
      ),
    },
    201,
  );
});

app.delete('/api/sites/:siteId', async (c) => {
  const record = await getSiteAccess(c, 'owner');
  if ('error' in record) return record.response;
  if (record.site.status !== 'archived')
    return jsonError(c, 409, 'VALIDATION_ERROR', 'Archive the website before deleting it');
  const db = getDb(c.env.DB);
  await db.delete(page).where(eq(page.siteId, record.site.id));
  await db.delete(siteRevision).where(eq(siteRevision.siteId, record.site.id));
  await db.delete(publishedRelease).where(eq(publishedRelease.siteId, record.site.id));
  await db.delete(publishedSite).where(eq(publishedSite.siteId, record.site.id));
  await db.delete(site).where(eq(site.id, record.site.id));
  return c.body(null, 204);
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
    parentId: null,
    folder: null,
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
  const record = await getSiteAccess(c, 'content');
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
  if (canonicalRole(record.membership.role) === 'content_editor') {
    const permissions = await db
      .select()
      .from(pagePermission)
      .where(eq(pagePermission.siteId, record.site.id))
      .all();
    const allowedPages = new Set(
      permissions
        .filter(
          (item) =>
            item.userId === record.user.id && ['content_editor', 'designer'].includes(item.role),
        )
        .map((item) => item.pageId),
    );
    if ((body.project.pages ?? []).some((item) => !allowedPages.has(String(item.id))))
      return jsonError(
        c,
        403,
        'FORBIDDEN',
        'Content editor does not have permission for every page',
      );
  }
  const incomingIds = new Set((body.project.pages ?? []).map((item) => String(item.id)));
  const parents = new Map(
    (body.project.pages ?? []).map((item) => [
      String(item.id),
      item.parentId ? String(item.parentId) : null,
    ]),
  );
  for (const [pageId, parentId] of parents) {
    if (parentId && !incomingIds.has(parentId))
      return jsonError(c, 400, 'VALIDATION_ERROR', `Parent page ${parentId} is not in this site`);
    const seen = new Set<string>();
    let cursor: string | null = pageId;
    while (cursor) {
      if (seen.has(cursor))
        return jsonError(c, 400, 'VALIDATION_ERROR', 'Page hierarchy contains a cycle');
      seen.add(cursor);
      cursor = parents.get(cursor) ?? null;
    }
  }
  const nextRevision = record.site.currentRevision + 1;
  const pageUpdates = (body.project.pages ?? []).map((item, index) =>
    db
      .update(page)
      .set({
        name: String(item.name ?? `Page ${index + 1}`),
        slug: String(item.slug ?? `/page-${index + 1}`),
        parentId: item.parentId ? String(item.parentId) : null,
        folder: item.folder ? String(item.folder).trim() || null : null,
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
  await runAutomations(c, record.site.workspaceId, 'revision.created', String(nextRevision), {
    siteId: record.site.id,
    revision: nextRevision,
    source: 'autosave',
  });
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
  await runAutomations(c, record.site.workspaceId, 'revision.created', revision.id, {
    siteId: record.site.id,
    revision: revision.revisionNumber,
    source: 'named_revision',
  });
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
        parentId: item.parentId ?? null,
        folder: item.folder ?? null,
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
  await runAutomations(c, record.site.workspaceId, 'revision.created', safety.id, {
    siteId: record.site.id,
    revision: safety.revisionNumber,
    source: 'restore',
    restoredRevision: selected.revisionNumber,
  });
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
  const activeForms = await db
    .select({ id: formDefinition.id })
    .from(formDefinition)
    .where(and(eq(formDefinition.siteId, record.site.id), eq(formDefinition.status, 'active')))
    .all();
  const now = new Date();
  const snapshot = createPublishedSnapshot(
    project,
    now.toISOString(),
    new Set(activeForms.map((form) => form.id)),
  );
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
  await runAutomations(c, record.site.workspaceId, 'site.published', release.id, {
    siteId: record.site.id,
    releaseId: release.id,
  });
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
  await runAutomations(c, record.site.workspaceId, 'site.unpublished', record.site.id, {
    siteId: record.site.id,
  });
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

app.get('/sites/:siteSlug/robots.txt', async (c) => {
  const published = await getPublishedSite(c, c.req.param('siteSlug'));
  if (!published) return new Response('Not found\n', { status: 404 });
  const base = publicSiteUrl(c, published.site.slug);
  return new Response(publicRobots(published.snapshot, base), {
    headers: {
      'Content-Type': 'text/plain; charset=UTF-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
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
app.get('/sites/:siteSlug/collection/:collectionSlug', async (c) =>
  renderPublicCollection(c, c.req.param('siteSlug'), c.req.param('collectionSlug')),
);
app.get('/sites/:siteSlug/collection/:collectionSlug/:recordSlug', async (c) =>
  renderPublicRecord(
    c,
    c.req.param('siteSlug'),
    c.req.param('collectionSlug'),
    c.req.param('recordSlug'),
  ),
);
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
  if (!page) return publicHtmlResponse(c, '<main><h1>Not found</h1></main>', 404);
  const hasAccess =
    !published.published.passwordHash ||
    (await validAccessToken(c, published.site.id, c.env.BETTER_AUTH_SECRET));
  const resolvedPage = {
    ...page,
    html: await resolveDynamicHtml(c, page.html, published.site.workspaceId),
  };
  const html = publicHtml(
    published.snapshot,
    resolvedPage,
    publicSiteUrl(c, published.site.slug),
    Boolean(published.published.passwordHash) && !hasAccess,
  );
  return publicHtmlResponse(
    c,
    html,
    foundPage ? 200 : 404,
    Boolean(foundPage && hasAccess && published.snapshot.interactions?.length),
  );
}

async function publicCollectionContext(c: Context<{ Bindings: Env }>, siteSlug: string) {
  const published = await getPublishedSite(c, siteSlug);
  if (!published || published.published.passwordHash) return null;
  return published;
}

async function renderPublicCollection(
  c: Context<{ Bindings: Env }>,
  siteSlug: string,
  collectionSlug: string,
): Promise<Response> {
  const published = await publicCollectionContext(c, siteSlug);
  if (!published) return publicHtmlResponse(c, '<main><h1>Not found</h1></main>', 404);
  const collection = await getDb(c.env.DB)
    .select()
    .from(cmsCollection)
    .where(
      and(
        eq(cmsCollection.workspaceId, published.site.workspaceId),
        eq(cmsCollection.slug, collectionSlug.toLowerCase()),
      ),
    )
    .get();
  if (!collection) return publicHtmlResponse(c, '<main><h1>Not found</h1></main>', 404);
  const records = await getDb(c.env.DB)
    .select()
    .from(cmsRecord)
    .where(and(eq(cmsRecord.collectionId, collection.id), eq(cmsRecord.status, 'published')))
    .limit(100)
    .all();
  const base = `${publicSiteUrl(c, published.site.slug)}/collection/${encodeURIComponent(collection.slug)}`;
  const items = records
    .map((record) => {
      const data = jsonValue(record.data, {}) as Record<string, unknown>;
      const title = String(data.title ?? data.name ?? record.slug);
      return `<article><h2><a href="${base}/${encodeURIComponent(record.slug)}">${escapePublicText(title)}</a></h2><p>${escapePublicText(String(data.description ?? ''))}</p></article>`;
    })
    .join('');
  return publicHtmlResponse(
    c,
    publicCollectionHtml(
      collection.name,
      `Published ${collection.name}`,
      `<main><h1>${escapePublicText(collection.name)}</h1>${items || '<p>No published records yet.</p>'}</main>`,
      base,
    ),
    200,
  );
}

async function renderPublicRecord(
  c: Context<{ Bindings: Env }>,
  siteSlug: string,
  collectionSlug: string,
  recordSlug: string,
): Promise<Response> {
  const published = await publicCollectionContext(c, siteSlug);
  if (!published) return publicHtmlResponse(c, '<main><h1>Not found</h1></main>', 404);
  const collection = await getDb(c.env.DB)
    .select()
    .from(cmsCollection)
    .where(
      and(
        eq(cmsCollection.workspaceId, published.site.workspaceId),
        eq(cmsCollection.slug, collectionSlug.toLowerCase()),
      ),
    )
    .get();
  const record = collection
    ? await getDb(c.env.DB)
        .select()
        .from(cmsRecord)
        .where(
          and(
            eq(cmsRecord.collectionId, collection.id),
            eq(cmsRecord.slug, recordSlug.toLowerCase()),
            eq(cmsRecord.status, 'published'),
          ),
        )
        .get()
    : null;
  if (!collection || !record) return publicHtmlResponse(c, '<main><h1>Not found</h1></main>', 404);
  const data = jsonValue(record.data, {}) as Record<string, unknown>;
  const title = String(data.title ?? data.name ?? record.slug);
  const body = Object.entries(data)
    .map(
      ([key, value]) =>
        `<section><h2>${escapePublicText(key)}</h2><p>${escapePublicText(String(value ?? ''))}</p></section>`,
    )
    .join('');
  const canonical = `${publicSiteUrl(c, published.site.slug)}/collection/${encodeURIComponent(collection.slug)}/${encodeURIComponent(record.slug)}`;
  return publicHtmlResponse(
    c,
    publicCollectionHtml(
      title,
      `Published ${collection.name}`,
      `<main><h1>${escapePublicText(title)}</h1>${body}</main>`,
      canonical,
    ),
    200,
  );
}

function publicCollectionHtml(
  title: string,
  description: string,
  body: string,
  canonical: string,
): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapePublicText(title)}</title><meta name="description" content="${escapePublicText(description)}"><link rel="canonical" href="${escapePublicText(canonical)}"><meta property="og:title" content="${escapePublicText(title)}"><meta property="og:description" content="${escapePublicText(description)}"><style>body{max-width:900px;margin:0 auto;padding:48px 24px;font-family:system-ui,sans-serif;line-height:1.6}article,section{border-top:1px solid #ddd;padding:20px 0}a{color:inherit}</style></head><body>${body}</body></html>`;
}

async function resolveDynamicHtml(
  c: Context<{ Bindings: Env }>,
  source: string,
  workspaceId: string,
): Promise<string> {
  const bindingPattern =
    /<([a-z][a-z0-9-]*)([^>]*data-wk-collection=["']([^"']+)["'][^>]*data-wk-field=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/\1>/gi;
  let output = source;
  const matches = [...source.matchAll(bindingPattern)].slice(0, 50);
  for (const match of matches) {
    const [whole, tag, attributes, collectionId, field, fallbackContent] = match;
    const repeat = /data-wk-repeat=["']true["']/i.test(attributes);
    const format = attributes.match(/data-wk-format=["']([^"']*)["']/i)?.[1] ?? 'plain';
    const fallback = attributes.match(/data-wk-fallback=["']([^"']*)["']/i)?.[1] ?? fallbackContent;
    const emptyBehavior = attributes.match(/data-wk-empty=["']([^"']*)["']/i)?.[1] ?? 'hide';
    const rows = await getDb(c.env.DB)
      .select()
      .from(cmsRecord)
      .where(
        and(
          eq(cmsRecord.collectionId, collectionId),
          eq(cmsRecord.workspaceId, workspaceId),
          eq(cmsRecord.status, 'published'),
        ),
      )
      .limit(100)
      .all();
    const value = (row: typeof cmsRecord.$inferSelect) =>
      escapePublicText(formatPublicValue(jsonValue(row.data, {})[field], format));
    const content = rows.length
      ? repeat
        ? rows.map(value).join('')
        : value(rows[0])
      : emptyBehavior === 'fallback'
        ? fallback
        : emptyBehavior === 'empty'
          ? ''
          : null;
    const replacement =
      content === null ? '' : `<${tag}${stripBindingAttributes(attributes)}>${content}</${tag}>`;
    output = output.replace(whole, replacement);
  }
  return output;
}
function stripBindingAttributes(attributes: string): string {
  return attributes.replace(
    /\s+data-wk-(?:collection|field|fallback|empty|repeat|format|preview)=(?:"[^"]*"|'[^']*')/gi,
    '',
  );
}
function escapePublicText(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
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
  interactive = false,
): Response {
  const response = c.html(html, status);
  response.headers.set(
    'Content-Security-Policy',
    `${interactive ? "default-src 'self'; script-src 'self'" : "default-src 'self'; script-src 'none'"}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'`,
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
      parentId: item.parentId ?? undefined,
      folder: item.folder ?? undefined,
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
    editorSettings: JSON.parse(record.editorSettings ?? '{}'),
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
    parentId: item.parentId ?? undefined,
    folder: item.folder ?? undefined,
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
    customDomain: item.customDomain ?? null,
    status: item.status,
    homepagePageId: item.homepagePageId,
    currentRevision: item.currentRevision,
    pageCount,
    updatedAt: new Date(item.updatedAt).toISOString(),
    updatedBy: user.id,
  };
}
function toAsset(item: typeof assetMetadata.$inferSelect) {
  return {
    id: item.id,
    workspaceId: item.workspaceId,
    siteId: item.siteId,
    filename: item.filename,
    mimeType: item.mimeType,
    size: item.size,
    altText: item.altText,
    caption: item.caption,
    folder: item.folder,
    tags: jsonValue(item.tags, []),
    focalPoint: jsonValue(item.focalPoint, { x: 50, y: 50 }),
    width: item.width,
    height: item.height,
    contentHash: item.contentHash,
    brandGroup: item.brandGroup,
    usageCount: item.usageCount,
    storageStatus: item.storageStatus,
    createdAt: new Date(item.createdAt).toISOString(),
    updatedAt: new Date(item.updatedAt).toISOString(),
    transformations: { available: false, reason: 'Image processing is not configured' },
  };
}
function replaceAssetReferences(value: unknown, from: string, to: string): unknown {
  if (typeof value === 'string') return value === from ? to : value;
  if (Array.isArray(value)) return value.map((item) => replaceAssetReferences(item, from, to));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, replaceAssetReferences(item, from, to)]),
  );
}
function accessUser(record: { user: { id: string } }) {
  return record.user;
}
async function getSiteAccess(
  c: Context<{ Bindings: Env }>,
  role: 'viewer' | 'editor' | 'content' | 'owner',
) {
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
  if (role === 'editor' && !roleAllows(record.membership.role, 'design'))
    return { error: true, response: jsonError(c, 403, 'FORBIDDEN', 'Editor access required') };
  if (role === 'content' && !roleAllows(record.membership.role, 'content'))
    return {
      error: true,
      response: jsonError(c, 403, 'FORBIDDEN', 'Content editor access required'),
    };
  if (role === 'owner' && !roleAllows(record.membership.role, 'owner'))
    return { error: true, response: jsonError(c, 403, 'FORBIDDEN', 'Owner access required') };
  return { ...record, user };
}

async function hashToken(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function collaborationRole(value: unknown): string | null {
  return ['administrator', 'designer', 'content_editor', 'reviewer', 'viewer'].includes(
    String(value),
  )
    ? String(value)
    : null;
}
function auditRow(
  workspaceId: string,
  userId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  siteId?: string,
  metadata: Record<string, unknown> = {},
) {
  return {
    id: crypto.randomUUID(),
    workspaceId,
    userId,
    siteId: siteId ?? null,
    action,
    resourceType,
    resourceId,
    metadata: JSON.stringify(metadata),
    createdAt: new Date(),
  };
}

app.get('/api/workspaces/:workspaceId/members', async (c) => {
  const workspaceId = c.req.param('workspaceId');
  const access = await requireMembership(c, workspaceId, [
    'owner',
    'administrator',
    'designer',
    'content_editor',
    'reviewer',
    'viewer',
  ]);
  if ('error' in access)
    return jsonError(
      c,
      access.error === 'UNAUTHENTICATED' ? 401 : 403,
      access.error === 'UNAUTHENTICATED' ? 'UNAUTHENTICATED' : 'FORBIDDEN',
      'Workspace access required',
    );
  const db = getDb(c.env.DB);
  const members = await db
    .select()
    .from(workspaceMembership)
    .where(eq(workspaceMembership.workspaceId, workspaceId))
    .all();
  const invites = await db
    .select()
    .from(collaborationInvite)
    .where(
      and(
        eq(collaborationInvite.workspaceId, workspaceId),
        eq(collaborationInvite.invitationStatus, 'pending'),
      ),
    )
    .all();
  return c.json({
    members: members.map((member) => ({ ...member, role: canonicalRole(member.role) })),
    invitations: invites.map((invite) => ({
      ...invite,
      role: canonicalRole(invite.role),
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
      delivery: 'copy_link',
    })),
  });
});

app.post('/api/workspaces/:workspaceId/invitations', async (c) => {
  const workspaceId = c.req.param('workspaceId');
  const access = await requireMembership(c, workspaceId, ['owner', 'administrator']);
  if ('error' in access)
    return jsonError(
      c,
      access.error === 'UNAUTHENTICATED' ? 401 : 403,
      access.error === 'UNAUTHENTICATED' ? 'UNAUTHENTICATED' : 'FORBIDDEN',
      'Administrator access required',
    );
  const body = await c.req.json<{ email?: string; role?: string; expiresInDays?: number }>();
  const email = body.email?.trim().toLowerCase();
  const role = collaborationRole(body.role);
  if (!email || !email.includes('@') || !role)
    return jsonError(
      c,
      400,
      'VALIDATION_ERROR',
      'A valid email and collaboration role are required',
    );
  const rawToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + Math.min(30, Math.max(1, body.expiresInDays ?? 7)) * 86400000,
  );
  const id = crypto.randomUUID();
  await getDb(c.env.DB).batch([
    getDb(c.env.DB)
      .insert(collaborationInvite)
      .values({
        id,
        workspaceId,
        email,
        role,
        tokenHash: await hashToken(rawToken),
        invitationStatus: 'pending',
        expiresAt,
        invitedBy: access.user.id,
        createdAt: now,
        acceptedAt: null,
      }),
    getDb(c.env.DB)
      .insert(auditEvent)
      .values(
        auditRow(
          workspaceId,
          access.user.id,
          'member.invited',
          'collaboration_invite',
          id,
          undefined,
          { role, email },
        ),
      ),
  ]);
  return c.json(
    {
      id,
      workspaceId,
      email,
      role,
      invitationStatus: 'pending',
      expiresAt: expiresAt.toISOString(),
      delivery: 'email_provider_unavailable',
      inviteUrl: `${new URL(c.req.url).origin}/invite/${encodeURIComponent(rawToken)}`,
    },
    201,
  );
});

app.post('/api/invitations/:token/accept', async (c) => {
  const user = await currentUser(c);
  if (!user) return jsonError(c, 401, 'UNAUTHENTICATED', 'Sign in required');
  const tokenHash = await hashToken(c.req.param('token'));
  const invite = await getDb(c.env.DB)
    .select()
    .from(collaborationInvite)
    .where(eq(collaborationInvite.tokenHash, tokenHash))
    .get();
  if (!invite || invite.invitationStatus !== 'pending' || invite.expiresAt.getTime() < Date.now())
    return jsonError(c, 404, 'NOT_FOUND', 'Invitation is unavailable or expired');
  if (invite.email !== user.email.toLowerCase())
    return jsonError(c, 403, 'FORBIDDEN', 'This invitation belongs to another account');
  const now = new Date();
  await getDb(c.env.DB).batch([
    getDb(c.env.DB).insert(workspaceMembership).values({
      id: crypto.randomUUID(),
      workspaceId: invite.workspaceId,
      userId: user.id,
      role: invite.role,
      invitationStatus: 'accepted',
      createdAt: now,
      updatedAt: now,
    }),
    getDb(c.env.DB)
      .update(collaborationInvite)
      .set({ invitationStatus: 'accepted', acceptedAt: now })
      .where(eq(collaborationInvite.id, invite.id)),
    getDb(c.env.DB)
      .insert(auditEvent)
      .values(
        auditRow(
          invite.workspaceId,
          user.id,
          'member.accepted',
          'collaboration_invite',
          invite.id,
          undefined,
          {},
        ),
      ),
  ]);
  return c.json({ workspaceId: invite.workspaceId, role: canonicalRole(invite.role) });
});

app.patch('/api/workspaces/:workspaceId/members/:membershipId', async (c) => {
  const workspaceId = c.req.param('workspaceId');
  const access = await requireMembership(c, workspaceId, ['owner', 'administrator']);
  if ('error' in access)
    return jsonError(
      c,
      access.error === 'UNAUTHENTICATED' ? 401 : 403,
      access.error === 'UNAUTHENTICATED' ? 'UNAUTHENTICATED' : 'FORBIDDEN',
      'Administrator access required',
    );
  const body = await c.req.json<{ role?: string }>();
  const role = collaborationRole(body.role);
  const member = await getDb(c.env.DB)
    .select()
    .from(workspaceMembership)
    .where(
      and(
        eq(workspaceMembership.id, c.req.param('membershipId')),
        eq(workspaceMembership.workspaceId, workspaceId),
      ),
    )
    .get();
  if (!member) return jsonError(c, 404, 'NOT_FOUND', 'Member not found');
  if (member.role === 'owner' || !role)
    return jsonError(c, 403, 'FORBIDDEN', 'Ownership cannot be changed through role management');
  await getDb(c.env.DB).batch([
    getDb(c.env.DB)
      .update(workspaceMembership)
      .set({ role, updatedAt: new Date() })
      .where(eq(workspaceMembership.id, member.id)),
    getDb(c.env.DB)
      .insert(auditEvent)
      .values(
        auditRow(
          workspaceId,
          access.user.id,
          'member.role_changed',
          'workspace_membership',
          member.id,
          undefined,
          { role },
        ),
      ),
  ]);
  return c.json({ id: member.id, role });
});

app.delete('/api/workspaces/:workspaceId/members/:membershipId', async (c) => {
  const workspaceId = c.req.param('workspaceId');
  const access = await requireMembership(c, workspaceId, ['owner', 'administrator']);
  if ('error' in access)
    return jsonError(
      c,
      access.error === 'UNAUTHENTICATED' ? 401 : 403,
      access.error === 'UNAUTHENTICATED' ? 'UNAUTHENTICATED' : 'FORBIDDEN',
      'Administrator access required',
    );
  const member = await getDb(c.env.DB)
    .select()
    .from(workspaceMembership)
    .where(
      and(
        eq(workspaceMembership.id, c.req.param('membershipId')),
        eq(workspaceMembership.workspaceId, workspaceId),
      ),
    )
    .get();
  if (!member) return jsonError(c, 404, 'NOT_FOUND', 'Member not found');
  if (member.role === 'owner')
    return jsonError(c, 403, 'FORBIDDEN', 'Workspace ownership must be transferred explicitly');
  await getDb(c.env.DB).batch([
    getDb(c.env.DB).delete(workspaceMembership).where(eq(workspaceMembership.id, member.id)),
    getDb(c.env.DB)
      .insert(auditEvent)
      .values(
        auditRow(workspaceId, access.user.id, 'member.removed', 'workspace_membership', member.id),
      ),
  ]);
  return c.body(null, 204);
});

app.get('/api/sites/:siteId/review-comments', async (c) => {
  const access = await getSiteAccess(c, 'viewer');
  if ('error' in access) return access.response;
  const rows = await getDb(c.env.DB)
    .select()
    .from(reviewComment)
    .where(eq(reviewComment.siteId, access.site.id))
    .orderBy(desc(reviewComment.createdAt))
    .all();
  return c.json(rows.map((row) => ({ ...row, mentions: jsonValue(row.mentions, []) })));
});

app.get('/api/sites/:siteId/page-permissions', async (c) => {
  const access = await getSiteAccess(c, 'viewer');
  if ('error' in access) return access.response;
  const rows = await getDb(c.env.DB)
    .select()
    .from(pagePermission)
    .where(eq(pagePermission.siteId, access.site.id))
    .all();
  return c.json(rows);
});

app.put('/api/sites/:siteId/pages/:pageId/permissions', async (c) => {
  const access = await getSiteAccess(c, 'owner');
  if ('error' in access) return access.response;
  const body = await c.req.json<{ userId?: string; role?: string }>();
  if (
    !body.userId ||
    !['viewer', 'content_editor', 'designer', 'reviewer'].includes(body.role ?? '')
  )
    return jsonError(c, 400, 'VALIDATION_ERROR', 'A user and page role are required');
  const pageRecord = await getDb(c.env.DB)
    .select()
    .from(page)
    .where(and(eq(page.id, c.req.param('pageId')), eq(page.siteId, access.site.id)))
    .get();
  const member = await getDb(c.env.DB)
    .select()
    .from(workspaceMembership)
    .where(
      and(
        eq(workspaceMembership.userId, body.userId),
        eq(workspaceMembership.workspaceId, access.site.workspaceId),
      ),
    )
    .get();
  if (!pageRecord || !member)
    return jsonError(c, 404, 'NOT_FOUND', 'Page or workspace member not found');
  const now = new Date();
  await getDb(c.env.DB)
    .insert(pagePermission)
    .values({
      id: crypto.randomUUID(),
      workspaceId: access.site.workspaceId,
      siteId: access.site.id,
      pageId: pageRecord.id,
      userId: body.userId,
      role: body.role!,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [pagePermission.pageId, pagePermission.userId],
      set: { role: body.role!, updatedAt: now },
    });
  return c.json({ pageId: pageRecord.id, userId: body.userId, role: body.role });
});

app.post('/api/sites/:siteId/review-comments', async (c) => {
  const access = await getSiteAccess(c, 'viewer');
  if ('error' in access) return access.response;
  if (!roleAllows(access.membership.role, 'review'))
    return jsonError(c, 403, 'FORBIDDEN', 'Review access required');
  const body = await c.req.json<{
    pageId?: string;
    componentId?: string;
    body?: string;
    mentions?: Array<{ userId?: string; label?: string }>;
  }>();
  const text = body.body?.trim();
  if (!text || text.length > 4000)
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Comment text is required');
  const now = new Date();
  const id = crypto.randomUUID();
  const mentions = (body.mentions ?? [])
    .filter((mention) => typeof mention.userId === 'string')
    .slice(0, 20);
  await getDb(c.env.DB).batch([
    getDb(c.env.DB)
      .insert(reviewComment)
      .values({
        id,
        workspaceId: access.site.workspaceId,
        siteId: access.site.id,
        pageId: body.pageId ?? null,
        componentId: body.componentId ?? null,
        body: text,
        mentions: JSON.stringify(mentions),
        status: 'open',
        createdBy: access.user.id,
        createdAt: now,
        updatedAt: now,
      }),
    getDb(c.env.DB)
      .insert(auditEvent)
      .values(
        auditRow(
          access.site.workspaceId,
          access.user.id,
          'review.comment_created',
          'review_comment',
          id,
          access.site.id,
          { componentId: body.componentId ?? null },
        ),
      ),
  ]);
  return c.json({ id, body: text, status: 'open', mentions }, 201);
});

app.patch('/api/review-comments/:commentId', async (c) => {
  const row = await getDb(c.env.DB)
    .select()
    .from(reviewComment)
    .where(eq(reviewComment.id, c.req.param('commentId')))
    .get();
  if (!row) return jsonError(c, 404, 'NOT_FOUND', 'Comment not found');
  const access = await requireMembership(c, row.workspaceId, [
    'owner',
    'administrator',
    'designer',
    'content_editor',
    'reviewer',
  ]);
  if ('error' in access)
    return jsonError(
      c,
      access.error === 'UNAUTHENTICATED' ? 401 : 403,
      access.error === 'UNAUTHENTICATED' ? 'UNAUTHENTICATED' : 'FORBIDDEN',
      'Review access required',
    );
  const body = await c.req.json<{ status?: string }>();
  if (!['open', 'resolved'].includes(body.status ?? ''))
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Review status is invalid');
  await getDb(c.env.DB)
    .update(reviewComment)
    .set({ status: body.status!, updatedAt: new Date() })
    .where(eq(reviewComment.id, row.id));
  return c.json({ id: row.id, status: body.status });
});

app.get('/api/workspaces/:workspaceId/audit-log', async (c) => {
  const access = await requireMembership(c, c.req.param('workspaceId'), [
    'owner',
    'administrator',
    'reviewer',
  ]);
  if ('error' in access)
    return jsonError(
      c,
      access.error === 'UNAUTHENTICATED' ? 401 : 403,
      access.error === 'UNAUTHENTICATED' ? 'UNAUTHENTICATED' : 'FORBIDDEN',
      'Audit access required',
    );
  const rows = await getDb(c.env.DB)
    .select()
    .from(auditEvent)
    .where(eq(auditEvent.workspaceId, c.req.param('workspaceId')))
    .orderBy(desc(auditEvent.createdAt))
    .limit(100)
    .all();
  return c.json(rows.map((row) => ({ ...row, metadata: jsonValue(row.metadata, {}) })));
});

app.post('/api/sites/:siteId/approval-requests', async (c) => {
  const access = await getSiteAccess(c, 'editor');
  if ('error' in access) return access.response;
  const body = await c.req.json<{ note?: string }>();
  const now = new Date();
  const id = crypto.randomUUID();
  await getDb(c.env.DB).batch([
    getDb(c.env.DB)
      .insert(approvalRequest)
      .values({
        id,
        workspaceId: access.site.workspaceId,
        siteId: access.site.id,
        status: 'pending',
        note: body.note?.slice(0, 1000) ?? '',
        requestedBy: access.user.id,
        reviewedBy: null,
        createdAt: now,
        updatedAt: now,
      }),
    getDb(c.env.DB)
      .insert(auditEvent)
      .values(
        auditRow(
          access.site.workspaceId,
          access.user.id,
          'approval.requested',
          'approval_request',
          id,
          access.site.id,
        ),
      ),
  ]);
  return c.json({ id, status: 'pending' }, 201);
});

app.patch('/api/approval-requests/:requestId', async (c) => {
  const request = await getDb(c.env.DB)
    .select()
    .from(approvalRequest)
    .where(eq(approvalRequest.id, c.req.param('requestId')))
    .get();
  if (!request) return jsonError(c, 404, 'NOT_FOUND', 'Approval request not found');
  const access = await requireMembership(c, request.workspaceId, [
    'owner',
    'administrator',
    'reviewer',
  ]);
  if ('error' in access)
    return jsonError(
      c,
      access.error === 'UNAUTHENTICATED' ? 401 : 403,
      access.error === 'UNAUTHENTICATED' ? 'UNAUTHENTICATED' : 'FORBIDDEN',
      'Reviewer access required',
    );
  const body = await c.req.json<{ status?: string }>();
  if (!['approved', 'rejected', 'cancelled'].includes(body.status ?? ''))
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Approval status is invalid');
  await getDb(c.env.DB)
    .update(approvalRequest)
    .set({ status: body.status!, reviewedBy: access.user.id, updatedAt: new Date() })
    .where(eq(approvalRequest.id, request.id));
  return c.json({ id: request.id, status: body.status });
});

app.post('/api/sites/:siteId/review-links', async (c) => {
  const access = await getSiteAccess(c, 'viewer');
  if ('error' in access) return access.response;
  if (!roleAllows(access.membership.role, 'review'))
    return jsonError(c, 403, 'FORBIDDEN', 'Review access required');
  const body = await c.req.json<{ mode?: string; expiresInHours?: number }>();
  const mode = body.mode === 'client' ? 'client' : 'review';
  const rawToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + Math.min(168, Math.max(1, body.expiresInHours ?? 72)) * 3600000,
  );
  const id = crypto.randomUUID();
  await getDb(c.env.DB)
    .insert(reviewLink)
    .values({
      id,
      workspaceId: access.site.workspaceId,
      siteId: access.site.id,
      mode,
      tokenHash: await hashToken(rawToken),
      expiresAt,
      createdBy: access.user.id,
      createdAt: now,
    });
  return c.json(
    {
      id,
      siteId: access.site.id,
      mode,
      expiresAt: expiresAt.toISOString(),
      url: `${new URL(c.req.url).origin}/review/${encodeURIComponent(rawToken)}`,
    },
    201,
  );
});

app.get('/api/review-links/:token', async (c) => {
  const tokenHash = await hashToken(c.req.param('token'));
  const link = await getDb(c.env.DB)
    .select()
    .from(reviewLink)
    .where(eq(reviewLink.tokenHash, tokenHash))
    .get();
  if (!link || link.expiresAt.getTime() < Date.now())
    return jsonError(c, 404, 'NOT_FOUND', 'Review link expired or unavailable');
  const siteRecord = await getDb(c.env.DB)
    .select()
    .from(site)
    .where(eq(site.id, link.siteId))
    .get();
  if (!siteRecord) return jsonError(c, 404, 'NOT_FOUND', 'Review site unavailable');
  return c.json({
    id: link.id,
    siteId: link.siteId,
    workspaceId: link.workspaceId,
    mode: link.mode,
    expiresAt: link.expiresAt.toISOString(),
    siteName: siteRecord.name,
    realtime: false,
  });
});

app.get('/api/workspaces/:workspaceId/assets', async (c) => {
  const access = await requireMembership(c, c.req.param('workspaceId'), [
    'owner',
    'admin',
    'editor',
    'viewer',
  ]);
  if (access.error === 'UNAUTHENTICATED')
    return jsonError(c, 401, access.error, 'Sign in required');
  if (access.error === 'FORBIDDEN')
    return jsonError(c, 403, access.error, 'Workspace access required');
  const rows = await getDb(c.env.DB)
    .select()
    .from(assetMetadata)
    .where(eq(assetMetadata.workspaceId, c.req.param('workspaceId')))
    .all();
  const query = (c.req.query('q') ?? '').trim().toLowerCase();
  const type = c.req.query('type');
  const folder = c.req.query('folder');
  const sort = c.req.query('sort') ?? 'updated';
  const filtered = rows
    .filter(
      (item) =>
        !query ||
        `${item.filename} ${item.altText} ${item.caption} ${item.tags}`
          .toLowerCase()
          .includes(query),
    )
    .filter((item) => !type || item.mimeType.startsWith(type))
    .filter((item) => !folder || item.folder === folder)
    .sort((a, b) =>
      sort === 'name'
        ? a.filename.localeCompare(b.filename)
        : sort === 'size'
          ? b.size - a.size
          : b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
  return c.json(filtered.slice(0, 200).map(toAsset));
});

app.post('/api/workspaces/:workspaceId/assets', async (c) => {
  const workspaceId = c.req.param('workspaceId');
  const access = await requireMembership(c, workspaceId, ['owner', 'admin', 'editor']);
  if (access.error === 'UNAUTHENTICATED')
    return jsonError(c, 401, access.error, 'Sign in required');
  if (access.error === 'FORBIDDEN')
    return jsonError(c, 403, access.error, 'Editor access required');
  const body = await c.req.json<{
    siteId?: string;
    filename?: string;
    mimeType?: string;
    size?: number;
    altText?: string;
    caption?: string;
    folder?: string;
    tags?: string[];
    focalPoint?: { x: number; y: number };
    width?: number;
    height?: number;
    contentHash?: string;
    brandGroup?: string;
  }>();
  if (
    !body.siteId ||
    !body.filename ||
    !body.mimeType ||
    !Number.isFinite(body.size) ||
    body.size! < 0
  )
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Asset metadata is incomplete');
  const siteRecord = await getDb(c.env.DB)
    .select()
    .from(site)
    .where(and(eq(site.id, body.siteId), eq(site.workspaceId, workspaceId)))
    .get();
  if (!siteRecord) return jsonError(c, 404, 'NOT_FOUND', 'Site not found');
  const now = new Date();
  const id = crypto.randomUUID();
  await getDb(c.env.DB)
    .insert(assetMetadata)
    .values({
      id,
      workspaceId,
      siteId: body.siteId,
      filename: body.filename.slice(0, 240),
      mimeType: body.mimeType.slice(0, 120),
      size: Math.round(body.size!),
      altText: body.altText?.slice(0, 500) ?? '',
      caption: body.caption?.slice(0, 500) ?? '',
      folder: body.folder?.slice(0, 200) || '/',
      tags: JSON.stringify((body.tags ?? []).slice(0, 30)),
      focalPoint: JSON.stringify(body.focalPoint ?? { x: 50, y: 50 }),
      width: body.width ?? null,
      height: body.height ?? null,
      contentHash: body.contentHash?.slice(0, 128) ?? null,
      brandGroup: body.brandGroup?.slice(0, 120) ?? null,
      storageStatus: 'metadata_only',
      createdBy: access.user.id,
      createdAt: now,
      updatedAt: now,
    });
  return c.json(
    toAsset(
      (await getDb(c.env.DB).select().from(assetMetadata).where(eq(assetMetadata.id, id)).get())!,
    ),
    201,
  );
});

app.patch('/api/assets/:assetId', async (c) => {
  const existing = await getDb(c.env.DB)
    .select()
    .from(assetMetadata)
    .where(eq(assetMetadata.id, c.req.param('assetId')))
    .get();
  if (!existing) return jsonError(c, 404, 'NOT_FOUND', 'Asset not found');
  const access = await requireMembership(c, existing.workspaceId, ['owner', 'admin', 'editor']);
  if (access.error === 'UNAUTHENTICATED')
    return jsonError(c, 401, access.error, 'Sign in required');
  if (access.error === 'FORBIDDEN')
    return jsonError(c, 403, access.error, 'Editor access required');
  const body = await c.req.json<{
    altText?: string;
    caption?: string;
    folder?: string;
    tags?: string[];
    focalPoint?: { x: number; y: number };
    brandGroup?: string;
  }>();
  await getDb(c.env.DB)
    .update(assetMetadata)
    .set({
      altText: body.altText?.slice(0, 500) ?? existing.altText,
      caption: body.caption?.slice(0, 500) ?? existing.caption,
      folder: body.folder?.slice(0, 200) || existing.folder,
      tags: JSON.stringify((body.tags ?? jsonValue(existing.tags, [])).slice(0, 30)),
      focalPoint: JSON.stringify(
        body.focalPoint ?? jsonValue(existing.focalPoint, { x: 50, y: 50 }),
      ),
      brandGroup: body.brandGroup?.slice(0, 120) ?? existing.brandGroup,
      updatedAt: new Date(),
    })
    .where(eq(assetMetadata.id, existing.id));
  return c.json(
    toAsset(
      (await getDb(c.env.DB)
        .select()
        .from(assetMetadata)
        .where(eq(assetMetadata.id, existing.id))
        .get())!,
    ),
  );
});

app.delete('/api/assets/:assetId', async (c) => {
  const existing = await getDb(c.env.DB)
    .select()
    .from(assetMetadata)
    .where(eq(assetMetadata.id, c.req.param('assetId')))
    .get();
  if (!existing) return jsonError(c, 404, 'NOT_FOUND', 'Asset not found');
  const access = await requireMembership(c, existing.workspaceId, ['owner', 'admin']);
  if (access.error === 'UNAUTHENTICATED')
    return jsonError(c, 401, access.error, 'Sign in required');
  if (access.error === 'FORBIDDEN')
    return jsonError(c, 403, access.error, 'Owner or admin access required');
  if (existing.usageCount > 0)
    return jsonError(
      c,
      409,
      'ASSET_IN_USE',
      'Asset is still used by a project; replace usages before deleting',
    );
  await getDb(c.env.DB).delete(assetMetadata).where(eq(assetMetadata.id, existing.id));
  return c.body(null, 204);
});

app.post('/api/assets/:assetId/replace', async (c) => {
  const existing = await getDb(c.env.DB)
    .select()
    .from(assetMetadata)
    .where(eq(assetMetadata.id, c.req.param('assetId')))
    .get();
  if (!existing) return jsonError(c, 404, 'NOT_FOUND', 'Asset not found');
  const access = await requireMembership(c, existing.workspaceId, ['owner', 'admin', 'editor']);
  if (access.error === 'UNAUTHENTICATED')
    return jsonError(c, 401, access.error, 'Sign in required');
  if (access.error === 'FORBIDDEN')
    return jsonError(c, 403, access.error, 'Editor access required');
  const body = await c.req.json<{ replacementAssetId?: string }>();
  const replacement = body.replacementAssetId
    ? await getDb(c.env.DB)
        .select()
        .from(assetMetadata)
        .where(
          and(
            eq(assetMetadata.id, body.replacementAssetId),
            eq(assetMetadata.workspaceId, existing.workspaceId),
          ),
        )
        .get()
    : null;
  if (!replacement)
    return jsonError(
      c,
      400,
      'VALIDATION_ERROR',
      'Replacement asset must belong to the same workspace',
    );
  const pages = await getDb(c.env.DB)
    .select()
    .from(page)
    .innerJoin(site, eq(page.siteId, site.id))
    .where(and(eq(site.workspaceId, existing.workspaceId), isNull(page.deletedAt)))
    .all();
  let replaced = 0;
  for (const row of pages) {
    const before = JSON.stringify(row.page.projectData);
    const next = replaceAssetReferences(
      JSON.parse(row.page.projectData),
      existing.id,
      replacement.id,
    );
    if (JSON.stringify(next) !== before) {
      replaced += 1;
      await getDb(c.env.DB)
        .update(page)
        .set({ projectData: JSON.stringify(next), updatedAt: new Date() })
        .where(eq(page.id, row.page.id));
    }
  }
  await getDb(c.env.DB)
    .update(assetMetadata)
    .set({ usageCount: 0, updatedAt: new Date() })
    .where(eq(assetMetadata.id, existing.id));
  await getDb(c.env.DB)
    .update(assetMetadata)
    .set({ usageCount: replacement.usageCount + replaced, updatedAt: new Date() })
    .where(eq(assetMetadata.id, replacement.id));
  return c.json({ replacedPages: replaced, replacementAssetId: replacement.id });
});

app.onError((error, c) => {
  console.error(JSON.stringify({ event: 'worker_error', message: error.message }));
  return jsonError(c, 500, 'INTERNAL_FAILURE', 'The request could not be completed');
});
export default app;
