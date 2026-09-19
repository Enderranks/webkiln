import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../src/models/project-schema';
import {
  defaultDesignSystem,
  healthScores,
  normalizeDesignSystem,
  scanDesignGuardian,
  tokenCss,
  tokenUsageCount,
} from '../src/editor/design-system';

describe('v14 design system and guardian', () => {
  it('creates reusable tokens and scoped CSS', () => {
    const system = defaultDesignSystem();
    expect(system.tokens.length).toBeGreaterThan(10);
    expect(tokenCss(system)).toContain('--wk-color-brand-primary');
    expect(normalizeDesignSystem(system).tokens).toHaveLength(system.tokens.length);
  });
  it('counts token usage and reports safe project findings', () => {
    const project = createEmptyProject();
    project.pages = [
      {
        id: 'home',
        name: 'Home',
        slug: '/',
        projectData: { components: '<img src="x" onclick="bad()">' },
        updatedAt: new Date().toISOString(),
      },
    ];
    const token = project.editorSettings!.designSystem!.tokens[0];
    expect(tokenUsageCount(project, token)).toBeGreaterThanOrEqual(0);
    expect(scanDesignGuardian(project).map((item) => item.id)).toEqual(
      expect.arrayContaining(['alt-home', 'unsafe-home']),
    );
    expect(healthScores(project).Performance.score).toBeNull();
  });
});
