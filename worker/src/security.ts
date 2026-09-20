import type { Context } from 'hono';
import { and, eq } from 'drizzle-orm';
import type { Env } from './env';
import { getAuth } from './auth';
import { getDb } from './db/client';
import { workspaceMembership } from './db/schema';
import type { WorkspaceRole } from '../../src/cloud/contracts';
import { collaborationRoles, roleAllows } from '../../src/cloud/roles';
export { canonicalRole, roleAllows } from '../../src/cloud/roles';
export const workspaceRoles = collaborationRoles;

export async function currentUser(c: Context<{ Bindings: Env }>) {
  const session = await getAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  return session?.user ?? null;
}

export async function requireMembership(
  c: Context<{ Bindings: Env }>,
  workspaceId: string,
  roles: WorkspaceRole[],
) {
  const user = await currentUser(c);
  if (!user) return { error: 'UNAUTHENTICATED' as const };
  const membership = await getDb(c.env.DB)
    .select()
    .from(workspaceMembership)
    .where(
      and(
        eq(workspaceMembership.workspaceId, workspaceId),
        eq(workspaceMembership.userId, user.id),
      ),
    )
    .get();
  if (
    !membership ||
    !roles.some((role) =>
      roleAllows(
        membership.role,
        role === 'owner'
          ? 'owner'
          : role === 'admin' || role === 'administrator'
            ? 'admin'
            : role === 'designer' || role === 'editor'
              ? 'design'
              : role === 'content_editor'
                ? 'content'
                : role === 'reviewer'
                  ? 'review'
                  : 'view',
      ),
    )
  )
    return { error: 'FORBIDDEN' as const };
  return { user, membership };
}
