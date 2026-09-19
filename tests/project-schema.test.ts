import { describe, expect, it } from 'vitest';
import { createEmptyProject, isWebKilnProject, migrateProject } from '../src/models/project-schema';

describe('WebKiln project schema', () => {
  it('creates a valid versioned project', () => {
    const project = createEmptyProject();
    expect(project.schemaVersion).toBe(1);
    expect(isWebKilnProject(project)).toBe(true);
    expect(project.pages).toEqual([]);
  });

  it('migrates invalid or legacy data without throwing', () => {
    const project = migrateProject({ site: { title: 'Legacy site' } });
    expect(isWebKilnProject(project)).toBe(true);
    expect(project.site.title).toBe('Legacy site');
    expect(project.customCode.isolated).toBe(true);
  });
});
