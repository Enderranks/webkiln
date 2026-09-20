import type {
  InteractionAction,
  InteractionActionType,
  InteractionDefinition,
  InteractionTrigger,
} from '../types';

export const INTERACTION_TRIGGERS: Array<{ id: InteractionTrigger; label: string }> = [
  { id: 'page-load', label: 'Page load' },
  { id: 'enter-viewport', label: 'Element enters viewport' },
  { id: 'leave-viewport', label: 'Element leaves viewport' },
  { id: 'click', label: 'Click' },
  { id: 'hover', label: 'Hover' },
  { id: 'focus', label: 'Focus' },
  { id: 'form-success', label: 'Form success' },
  { id: 'scroll-position', label: 'Scroll position' },
  { id: 'breakpoint-change', label: 'Breakpoint change' },
];
export const INTERACTION_ACTIONS: Array<{ id: InteractionActionType; label: string }> = [
  { id: 'show', label: 'Show' },
  { id: 'hide', label: 'Hide' },
  { id: 'toggle-class', label: 'Toggle class' },
  { id: 'open-modal', label: 'Open modal' },
  { id: 'open-drawer', label: 'Open drawer' },
  { id: 'switch-tab', label: 'Switch tab' },
  { id: 'expand-accordion', label: 'Expand accordion' },
  { id: 'scroll-to', label: 'Scroll to element' },
  { id: 'opacity', label: 'Change opacity' },
  { id: 'translate', label: 'Translate' },
  { id: 'scale', label: 'Scale' },
  { id: 'rotate', label: 'Rotate' },
  { id: 'color', label: 'Animate color' },
  { id: 'counter', label: 'Start counter' },
  { id: 'media-play', label: 'Play media' },
  { id: 'media-pause', label: 'Pause media' },
];

const actionTypes = new Set(INTERACTION_ACTIONS.map((item) => item.id));
const triggerTypes = new Set(INTERACTION_TRIGGERS.map((item) => item.id));
const easingTypes = new Set(['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out']);

export function createInteraction(target: string): InteractionDefinition {
  const action: InteractionAction = {
    id: crypto.randomUUID(),
    type: 'show',
    target,
    duration: 300,
    delay: 0,
    easing: 'ease-out',
    reducedMotion: 'instant',
  };
  return {
    id: crypto.randomUUID(),
    name: 'New interaction',
    trigger: 'click',
    target,
    actions: [action],
    sequence: 'sequence',
    loop: { enabled: false, delay: 0 },
    enabled: true,
  };
}

export function validateInteraction(value: unknown): value is InteractionDefinition {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<InteractionDefinition>;
  return (
    typeof item.id === 'string' &&
    typeof item.target === 'string' &&
    typeof item.name === 'string' &&
    triggerTypes.has(item.trigger as InteractionTrigger) &&
    Array.isArray(item.actions) &&
    item.actions.every((action) => {
      if (!action || typeof action !== 'object') return false;
      const candidate = action as Partial<InteractionAction>;
      return (
        typeof candidate.id === 'string' &&
        actionTypes.has(candidate.type as InteractionActionType) &&
        Number.isFinite(candidate.duration) &&
        Number.isFinite(candidate.delay) &&
        easingTypes.has(candidate.easing ?? '')
      );
    })
  );
}

export function normalizeInteractions(value: unknown): InteractionDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.filter(validateInteraction).map((item) => ({
    ...item,
    enabled: item.enabled !== false,
    actions: item.actions.map((action) => ({
      ...action,
      duration: Math.min(10000, Math.max(0, Math.round(action.duration))),
      delay: Math.min(10000, Math.max(0, Math.round(action.delay))),
    })),
  }));
}

export function serializeInteractions(value: unknown): string {
  return JSON.stringify(normalizeInteractions(value));
}
