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
});
