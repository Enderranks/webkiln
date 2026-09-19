import { DEFAULT_BREAKPOINTS } from '../models/project-schema';
import type {
  EditorSettings,
  ResponsiveBreakpoint,
  ResponsiveComponentMetadata,
  ResponsiveIntent,
  ResponsiveIntentKind,
} from '../types';

export const INTENT_LABELS: Record<ResponsiveIntentKind, string> = {
  'keep-beside': 'Keep beside',
  'stack-below': 'Stack below',
  'full-width-small': 'Full-width on smaller screens',
  'hide-at-breakpoint': 'Hide at breakpoint',
  'reorder-mobile': 'Reorder on mobile',
  'maintain-aspect': 'Maintain aspect ratio',
  'prioritize-content': 'Prioritize content',
  'mobile-navigation': 'Convert navigation to mobile menu',
  'horizontal-scroll': 'Allow horizontal scrolling',
  accordion: 'Collapse into accordion',
  'responsive-type': 'Use responsive typography',
  'preserve-custom': 'Preserve custom behavior',
};

export function normalizeEditorSettings(value?: Partial<EditorSettings>): EditorSettings {
  return {
    mode: value?.mode === 'guided' || value?.mode === 'pro' ? value.mode : 'standard',
    breakpoints: value?.breakpoints?.length ? value.breakpoints : [...DEFAULT_BREAKPOINTS],
    responsiveIntents: value?.responsiveIntents ?? {},
  };
}

function media(breakpoint: ResponsiveBreakpoint): string {
  return breakpoint.width <= 390
    ? `(max-width:${breakpoint.width}px)`
    : `(max-width:${breakpoint.width}px)`;
}

export function intentClass(componentId: string): string {
  return `wk-intent-${componentId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

export function responsiveCss(
  componentId: string,
  metadata: ResponsiveComponentMetadata,
  breakpoints: ResponsiveBreakpoint[],
): string {
  const selector = `.${intentClass(componentId)}`;
  const rules: string[] = [];
  for (const intent of metadata.intents.filter((item) => item.enabled)) {
    const breakpoint =
      breakpoints.find((item) => item.id === (intent.breakpoint ?? 'mobile')) ?? breakpoints.at(-1);
    if (!breakpoint) continue;
    const declarations: string[] = [];
    if (intent.kind === 'stack-below') declarations.push('display:flex', 'flex-direction:column');
    if (intent.kind === 'keep-beside')
      declarations.push('display:flex', 'flex-direction:row', 'flex-wrap:nowrap');
    if (intent.kind === 'full-width-small') declarations.push('width:100%', 'max-width:100%');
    if (intent.kind === 'hide-at-breakpoint') declarations.push('display:none');
    if (intent.kind === 'reorder-mobile')
      declarations.push(`order:${Math.max(0, intent.order ?? 1)}`);
    if (intent.kind === 'maintain-aspect')
      declarations.push(`aspect-ratio:${intent.value || '16 / 9'}`, 'object-fit:cover');
    if (intent.kind === 'prioritize-content')
      declarations.push('content-visibility:auto', 'contain-intrinsic-size:320px');
    if (intent.kind === 'horizontal-scroll')
      declarations.push('overflow-x:auto', 'overscroll-behavior-inline:contain');
    if (intent.kind === 'responsive-type') declarations.push('font-size:clamp(1rem, 2.5vw, 2rem)');
    if (intent.kind === 'mobile-navigation')
      declarations.push('display:flex', 'flex-wrap:wrap', 'gap:.75rem');
    if (intent.kind === 'accordion')
      declarations.push('max-height:var(--wk-accordion-height, none)', 'overflow:hidden');
    if (declarations.length)
      rules.push(`@media ${media(breakpoint)}{${selector}{${declarations.join(';')}}}`);
  }
  return rules.join('\n');
}

export function setIntent(
  settings: EditorSettings,
  componentId: string,
  intent: ResponsiveIntent,
): EditorSettings {
  const existing = settings.responsiveIntents[componentId] ?? { intents: [] };
  const intents = existing.intents.filter(
    (item) => item.kind !== intent.kind || item.breakpoint !== intent.breakpoint,
  );
  if (intent.enabled) intents.push(intent);
  return {
    ...settings,
    responsiveIntents: { ...settings.responsiveIntents, [componentId]: { ...existing, intents } },
  };
}

export function resetBreakpoint(
  settings: EditorSettings,
  componentId: string,
  breakpoint: string,
): EditorSettings {
  const existing = settings.responsiveIntents[componentId];
  if (!existing) return settings;
  return {
    ...settings,
    responsiveIntents: {
      ...settings.responsiveIntents,
      [componentId]: {
        ...existing,
        intents: existing.intents.filter((item) => item.breakpoint !== breakpoint),
        overrides: { ...(existing.overrides ?? {}), [breakpoint]: false },
      },
    },
  };
}

export interface ResponsiveWarning {
  kind: 'touch-target' | 'overflow' | 'missing-inheritance';
  message: string;
}
export function validateResponsive(
  metadata: ResponsiveComponentMetadata,
  component?: { width?: number; height?: number },
): ResponsiveWarning[] {
  const warnings: ResponsiveWarning[] = [];
  if (
    metadata.intents.some(
      (item) => item.kind === 'mobile-navigation' || item.kind === 'prioritize-content',
    ) &&
    (component?.width ?? 44) < 44
  )
    warnings.push({
      kind: 'touch-target',
      message: 'Interactive content may be smaller than the 44px touch target.',
    });
  if (metadata.intents.some((item) => item.kind === 'horizontal-scroll'))
    warnings.push({
      kind: 'overflow',
      message: 'This component intentionally scrolls horizontally on smaller screens.',
    });
  if (metadata.intents.some((item) => item.enabled && !item.breakpoint))
    warnings.push({
      kind: 'missing-inheritance',
      message: 'This intent inherits its breakpoint from the responsive system.',
    });
  return warnings;
}
