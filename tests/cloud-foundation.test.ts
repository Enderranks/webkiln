import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../src/models/project-schema';
import { createMigrationBackup, previewLocalProject } from '../src/cloud/local-import';
import { projectSummary, validateProjectPayload } from '../src/cloud/validation';

describe('v10 cloud foundation', () => {
  it('validates and summarizes a migrated project', () => {
    const project = createEmptyProject();
    expect(projectSummary(validateProjectPayload(project))).toEqual({
      pageCount: 0,
      revisionCount: 1,
      assetCount: 0,
    });
  });
  it('previews local imports and preserves a backup', () => {
    const project = createEmptyProject();
    const preview = previewLocalProject(JSON.stringify(project));
    expect(preview.summary.revisionCount).toBe(1);
    expect(createMigrationBackup(project)).toContain('webkiln-local-migration');
  });
  it('rejects oversized payloads', () => {
    expect(() => validateProjectPayload({ huge: 'x'.repeat(9 * 1024 * 1024) })).toThrow(
      'too large',
    );
  });
});
