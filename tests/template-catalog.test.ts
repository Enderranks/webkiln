import { describe, expect, it } from 'vitest';
import { createTemplateProject, templateById } from '../src/cloud/template-catalog';

describe('template catalog', () => {
  it('provides deterministic starters with navigable pages', () => {
    const project = createTemplateProject(templateById('launch'), 'site-1', 'Acme');
    expect(project.pages.map((page) => page.slug)).toEqual(['/', '/about', '/contact']);
    expect(project.pages[0].projectData).toEqual(
      expect.objectContaining({ components: expect.stringContaining('Make the next move clear') }),
    );
    expect(project.site.id).toBe('site-1');
  });
  it('falls back safely for unknown template ids', () => {
    expect(templateById('missing').id).toBe('blank');
  });
});
