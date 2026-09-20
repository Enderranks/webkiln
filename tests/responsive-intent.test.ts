import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../src/models/project-schema';
import {
  addCustomBreakpoint,
  intentClass,
  normalizeEditorSettings,
  responsiveCss,
  setIntent,
  validateResponsive,
} from '../src/editor/responsive-intent';

describe('responsive intent engine', () => {
  it('provides inherited breakpoints and preserves mode/project data', () => {
    const project = createEmptyProject();
    expect(project.editorSettings?.mode).toBe('standard');
    expect(project.editorSettings?.breakpoints.map((item) => item.id)).toEqual([
      'desktop',
      'laptop',
      'tablet',
      'mobile',
    ]);
    const next = setIntent(project.editorSettings!, 'component-1', {
      kind: 'stack-below',
      enabled: true,
      breakpoint: 'mobile',
      source: 'guided',
    });
    expect(next.responsiveIntents['component-1'].intents[0].kind).toBe('stack-below');
    expect(next.mode).toBe('standard');
  });

  it('generates scoped predictable styles instead of event-specific selectors', () => {
    const settings = normalizeEditorSettings();
    const css = responsiveCss(
      'component 1',
      {
        intents: [{ kind: 'stack-below', enabled: true, breakpoint: 'mobile', source: 'standard' }],
      },
      settings.breakpoints,
    );
    expect(css).toContain(`.${intentClass('component 1')}`);
    expect(css).toContain('flex-direction:column');
    expect(css).not.toContain('onclick');
  });

  it('does not discard interaction or navigation metadata during normalization', () => {
    const settings = createEmptyProject().editorSettings!;
    settings.interactions = [
      {
        id: 'interaction-1',
        name: 'Reveal',
        trigger: 'page-load',
        target: '#hero',
        actions: [],
        sequence: 'sequence',
        loop: { enabled: false, delay: 0 },
        enabled: true,
      },
    ];
    settings.menus = [{ id: 'main', name: 'Main', items: [], mobileMode: 'drawer' }];
    const normalized = normalizeEditorSettings(settings);
    expect(normalized.interactions).toHaveLength(1);
    expect(normalized.menus?.[0].id).toBe('main');
  });

  it('reports intentional overflow and touch-target risks', () => {
    const warnings = validateResponsive(
      {
        intents: [
          { kind: 'horizontal-scroll', enabled: true, source: 'pro' },
          { kind: 'mobile-navigation', enabled: true, source: 'guided' },
        ],
      },
      { width: 32 },
    );
    expect(warnings.map((item) => item.kind)).toEqual(
      expect.arrayContaining(['overflow', 'touch-target']),
    );
  });

  it('adds bounded custom breakpoints with nearest wider inheritance', () => {
    const settings = normalizeEditorSettings();
    const result = addCustomBreakpoint(settings, 'Phone landscape', 600);
    expect(result.breakpoint.id).toBe('custom-600');
    expect(result.breakpoint.inheritedFrom).toBe('tablet');
    expect(result.settings.breakpoints.map((item) => item.id)).toContain('custom-600');
    expect(() => addCustomBreakpoint(settings, 'Too narrow', 200)).toThrow('between 320px');
  });
});
