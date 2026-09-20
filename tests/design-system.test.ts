import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../src/models/project-schema';
import {
  defaultDesignSystem,
  findTokenUsages,
  healthScores,
  normalizeDesignSystem,
  replaceTokenAcrossSite,
  renameToken,
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
    const scores = healthScores(project);
    expect(scores.Performance.score).toBeNull();
    expect(scores['Form configuration'].score).toBeNull();
    expect(scores['Broken links'].basis).toContain('Unavailable');
    expect(scanDesignGuardian(project).find((item) => item.id === 'unsafe-home')).toMatchObject({
      affectedComponent: 'Page markup',
      safe: true,
    });
  });

  it('finds and replaces a token across page content without changing its declaration', () => {
    const project = createEmptyProject();
    project.pages = [
      {
        id: 'home',
        name: 'Home',
        slug: '/',
        projectData: { styles: '.hero{color:#d6ad61;background:#d6ad61}' },
        updatedAt: new Date().toISOString(),
      },
    ];
    const token = project.editorSettings!.designSystem!.tokens[0];
    expect(findTokenUsages(project, token)).toEqual([
      { pageId: 'home', pageName: 'Home', count: 2 },
    ]);
    const result = replaceTokenAcrossSite(project, token, '#ffffff');
    expect(result.replacements).toBe(2);
    expect(JSON.stringify(result.project.pages[0].projectData)).not.toContain('#d6ad61');
    expect(result.project.editorSettings!.designSystem!.tokens[0].value).toBe('#d6ad61');
  });

  it('validates token renames and rejects duplicates', () => {
    const system = defaultDesignSystem();
    expect(
      renameToken(system, 'space.md', 'space.medium').tokens.some(
        (token) => token.name === 'space.medium',
      ),
    ).toBe(true);
    expect(() => renameToken(system, 'space.md', 'color.brand.primary')).toThrow('already exists');
  });
});
