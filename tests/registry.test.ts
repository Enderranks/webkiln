import { describe, expect, it } from 'vitest';
import { componentRegistry, getComponentDefinition } from '../src/components-registry/registry';

describe('component registry', () => {
  it('contains the required initial component families', () => {
    expect(componentRegistry.map((item) => item.id)).toEqual(
      expect.arrayContaining(['hero', 'pricing', 'form', 'navigation', 'gallery']),
    );
  });

  it('returns responsive metadata for registered components', () => {
    expect(getComponentDefinition('button')).toMatchObject({
      id: 'button',
      responsive: true,
      version: 1,
    });
  });
});
