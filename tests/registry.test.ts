import { describe, expect, it } from 'vitest';
import { componentRegistry, getComponentDefinition } from '../src/components-registry/registry';

describe('component registry', () => {
  it('contains the required initial component families', () => {
    expect(componentRegistry.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'navigation',
        'hero',
        'columns',
        'pricing',
        'gallery',
        'contact',
        'footer',
        'heading',
        'paragraph',
        'button',
        'image',
        'container',
        'spacer',
        'divider',
        'features',
        'services',
        'testimonials',
        'team',
        'blog',
        'events',
        'game-selector',
        'game-plans',
        'server-status',
        'hosting-quote',
        'venue-listing',
        'booking-request',
      ]),
    );
  });

  it('returns responsive metadata for registered components', () => {
    expect(getComponentDefinition('button')).toMatchObject({
      id: 'button',
      responsive: true,
      version: 1,
    });
  });

  it('provides migration and placement metadata for every definition', () => {
    expect(
      componentRegistry.every(
        (item) => item.defaultContent && item.migrate && item.allowedParents.length,
      ),
    ).toBe(true);
  });

  it('describes smart section purpose, content requirements, and variants', () => {
    const definition = getComponentDefinition('features');
    expect(definition?.smartSection).toMatchObject({
      purpose: expect.any(String),
      requiredContent: expect.arrayContaining(['Section heading']),
      variants: expect.arrayContaining(['cards']),
    });
  });

  it('registers ecosystem sections with safe responsive metadata', () => {
    for (const id of [
      'game-selector',
      'game-plans',
      'server-status',
      'venue-listing',
      'booking-request',
    ]) {
      expect(getComponentDefinition(id)).toMatchObject({
        id,
        responsive: true,
        smartSection: {
          purpose: expect.any(String),
          requiredContent: expect.any(Array),
          variants: expect.any(Array),
        },
      });
    }
  });
});
