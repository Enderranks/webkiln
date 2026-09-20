import type { WorkspaceRole } from './contracts';

export const collaborationRoles: WorkspaceRole[] = [
  'owner',
  'administrator',
  'designer',
  'content_editor',
  'reviewer',
  'viewer',
  'admin',
  'editor',
];
export function canonicalRole(role: string): Exclude<WorkspaceRole, 'admin' | 'editor'> {
  if (role === 'admin') return 'administrator';
  if (role === 'editor') return 'designer';
  return (collaborationRoles.includes(role as WorkspaceRole) ? role : 'viewer') as Exclude<
    WorkspaceRole,
    'admin' | 'editor'
  >;
}
export function roleAllows(
  role: string,
  required: 'view' | 'content' | 'design' | 'review' | 'admin' | 'owner',
): boolean {
  const value = canonicalRole(role);
  if (required === 'owner') return value === 'owner';
  if (required === 'admin') return value === 'owner' || value === 'administrator';
  if (required === 'design') return ['owner', 'administrator', 'designer'].includes(value);
  if (required === 'content')
    return ['owner', 'administrator', 'designer', 'content_editor'].includes(value);
  if (required === 'review')
    return ['owner', 'administrator', 'designer', 'content_editor', 'reviewer'].includes(value);
  return true;
}
