export type LayoutPreset = 'stack' | 'flex' | 'grid' | 'container' | 'free-position';

export const LAYOUT_PRESETS: Record<LayoutPreset, Record<string, string>> = {
  stack: {
    display: 'flex',
    'flex-direction': 'column',
    'align-items': 'stretch',
    gap: 'var(--wk-space-md, 16px)',
  },
  flex: {
    display: 'flex',
    'flex-direction': 'row',
    'align-items': 'center',
    'justify-content': 'space-between',
    gap: 'var(--wk-space-md, 16px)',
  },
  grid: {
    display: 'grid',
    'grid-template-columns': 'repeat(2, minmax(0, 1fr))',
    gap: 'var(--wk-space-md, 16px)',
  },
  container: {
    display: 'block',
    width: '100%',
    'max-width': '1120px',
    margin: '0 auto',
  },
  'free-position': {
    position: 'relative',
    overflow: 'visible',
  },
};

export const LAYOUT_CONTROLS = [
  'display',
  'flex-direction',
  'flex-wrap',
  'grid-template-columns',
  'gap',
  'justify-content',
  'align-items',
  'position',
  'overflow',
  'z-index',
] as const;

export function getLayoutPresetStyles(preset: LayoutPreset): Record<string, string> {
  return { ...LAYOUT_PRESETS[preset] };
}
