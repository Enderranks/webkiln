import { describe, expect, it } from 'vitest';
import {
  createTemplateProject,
  templateById,
  WEBKILN_TEMPLATES,
} from '../src/cloud/template-catalog';

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
  it('includes deterministic industry kits with recommended pages', () => {
    expect(WEBKILN_TEMPLATES.length).toBeGreaterThanOrEqual(10);
    expect(templateById('hosting').recommendedPages).toContain('/pricing');
    expect(templateById('restaurant').websiteType).toBe('restaurant');
  });
  it('preserves selected pages and onboarding choices in the project', () => {
    const project = createTemplateProject(templateById('events'), 'site-2', 'Gather', {
      description: 'A community event',
      businessType: 'events',
      selectedPageSlugs: ['/', '/tickets'],
      primaryColor: '#ffcc66',
      style: 'editorial',
    });
    expect(project.pages.map((page) => page.slug)).toEqual(['/', '/tickets']);
    expect(project.site.description).toBe('A community event');
    expect(project.site.goal).toBe('register');
    expect(project.themeTokens).toMatchObject({ primary: '#ffcc66', style: 'editorial' });
  });
});
