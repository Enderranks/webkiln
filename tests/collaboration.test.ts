import { describe, expect, it } from 'vitest';
import { canonicalRole, roleAllows } from '../src/cloud/roles';

describe('collaboration authorization model', () => {
  it('normalizes legacy roles without trusting frontend labels', () => {
    expect(canonicalRole('admin')).toBe('administrator');
    expect(canonicalRole('editor')).toBe('designer');
    expect(canonicalRole('made-up-role')).toBe('viewer');
  });

  it('enforces least privilege by role', () => {
    expect(roleAllows('owner', 'owner')).toBe(true);
    expect(roleAllows('administrator', 'owner')).toBe(false);
    expect(roleAllows('designer', 'design')).toBe(true);
    expect(roleAllows('content_editor', 'design')).toBe(false);
    expect(roleAllows('reviewer', 'review')).toBe(true);
    expect(roleAllows('viewer', 'content')).toBe(false);
  });
});
