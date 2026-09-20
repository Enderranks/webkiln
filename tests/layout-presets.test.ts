import { describe, expect, it } from 'vitest';
import { getLayoutPresetStyles, LAYOUT_CONTROLS } from '../src/editor/layout-presets';

describe('layout presets', () => {
  it('provides predictable foundations without arbitrary declarations', () => {
    expect(getLayoutPresetStyles('stack')).toMatchObject({
      display: 'flex',
      'flex-direction': 'column',
    });
    expect(getLayoutPresetStyles('grid')).toMatchObject({ display: 'grid' });
    expect(getLayoutPresetStyles('container')).toMatchObject({ 'max-width': '1120px' });
    expect(getLayoutPresetStyles('free-position')).toMatchObject({ position: 'relative' });
  });

  it('exposes the supported visual layout control set', () => {
    expect(LAYOUT_CONTROLS).toEqual(
      expect.arrayContaining(['display', 'gap', 'align-items', 'overflow', 'z-index']),
    );
  });
});
