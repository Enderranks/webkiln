import type { InteractionActionType, InteractionTrigger, WebKilnProject } from '../types';
import {
  createInteraction,
  INTERACTION_ACTIONS,
  INTERACTION_TRIGGERS,
} from '../models/interaction-schema';
import { GrapesJSEditorAdapter } from './grapesjs-adapter';
import { installInteractionRuntime } from './interaction-runtime';

export class InteractionEditorController {
  private previewCleanup: (() => void) | null = null;
  constructor(
    private readonly adapter: GrapesJSEditorAdapter,
    private readonly project: WebKilnProject,
    private readonly dirty: () => void,
  ) {}

  start(): void {
    const panel = document.querySelector<HTMLElement>('#sitePanel');
    if (!panel || panel.querySelector('[data-interaction-editor]')) return;
    const card = document.createElement('section');
    card.dataset.interactionEditor = 'true';
    card.className = 'recovery-card interaction-editor';
    card.innerHTML = `<div class="interaction-heading"><div><p class="eyebrow">Interactions</p><strong>Motion with intent</strong><small>Build safe, reusable behaviors without inline JavaScript.</small></div><div><button type="button" class="ghost-btn" data-preview-interactions>Preview</button><button type="button" class="ghost-btn" data-pause-interactions>Pause</button><button type="button" class="ghost-btn" data-reset-interactions>Reset</button><button type="button" class="primary-btn" data-add-interaction>Add interaction</button></div></div><div data-interaction-list></div><p class="field-help">Reduced-motion users receive instant or skipped motion according to each action’s fallback.</p>`;
    panel.prepend(card);
    card.querySelector('[data-add-interaction]')?.addEventListener('click', () => {
      const id = this.adapter.getComponentId(this.adapter.getSelectedComponent());
      if (!id) {
        this.showMessage(card, 'Select an element on the canvas first.');
        return;
      }
      const interaction = createInteraction(`[data-wk-id="${id}"]`);
      this.project.editorSettings!.interactions = [
        ...(this.project.editorSettings?.interactions ?? []),
        interaction,
      ];
      this.ensureTargetAttribute(id);
      this.dirty();
      this.render(card);
    });
    card.querySelector('[data-preview-interactions]')?.addEventListener('click', () => {
      this.previewCleanup?.();
      const frame = this.adapter.getFrameDocument();
      if (frame)
        this.previewCleanup = installInteractionRuntime(
          frame,
          this.project.editorSettings?.interactions,
        );
      this.showMessage(card, 'Preview running. Trigger an interaction in the canvas.');
    });
    card.querySelector('[data-pause-interactions]')?.addEventListener('click', () => {
      this.previewCleanup?.();
      this.previewCleanup = null;
      this.showMessage(card, 'Preview paused.');
    });
    card.querySelector('[data-reset-interactions]')?.addEventListener('click', () => {
      this.previewCleanup?.();
      this.previewCleanup = null;
      this.project.editorSettings!.interactions = [];
      this.dirty();
      this.render(card);
    });
    this.render(card);
  }

  private ensureTargetAttribute(id: string): void {
    const selected = this.adapter.getSelectedComponent();
    if (selected) this.adapter.updateComponentTraits(selected, { 'data-wk-id': id });
  }

  private render(card: HTMLElement): void {
    const list = card.querySelector<HTMLElement>('[data-interaction-list]');
    if (!list) return;
    const interactions = this.project.editorSettings?.interactions ?? [];
    list.innerHTML = interactions.length
      ? interactions
          .map(
            (item, index) =>
              `<article class="interaction-row" data-interaction-index="${index}"><div class="interaction-flow"><span>${this.label(INTERACTION_TRIGGERS, item.trigger)}</span><b>→</b><span>${item.actions.length} action${item.actions.length === 1 ? '' : 's'}</span></div><div class="interaction-controls"><label>Name<input data-interaction-name="${index}" value="${this.escape(item.name)}" /></label><label>Trigger<select data-interaction-trigger="${index}">${INTERACTION_TRIGGERS.map((trigger) => `<option value="${trigger.id}" ${trigger.id === item.trigger ? 'selected' : ''}>${trigger.label}</option>`).join('')}</select></label><label>Action<select data-interaction-action="${index}">${INTERACTION_ACTIONS.map((action) => `<option value="${action.id}" ${action.id === item.actions[0]?.type ? 'selected' : ''}>${action.label}</option>`).join('')}</select></label><label>Duration<input type="number" min="0" max="10000" step="50" data-interaction-duration="${index}" value="${item.actions[0]?.duration ?? 300}" /></label><label class="switch-field"><input type="checkbox" data-interaction-enabled="${index}" ${item.enabled ? 'checked' : ''} /> Enabled</label><button type="button" class="text-button" data-duplicate-interaction="${index}">Duplicate</button><button type="button" class="text-button danger-action" data-delete-interaction="${index}">Remove</button></div></article>`,
          )
          .join('')
      : '<small>No interactions yet. Select a canvas element and add one.</small>';
    list
      .querySelectorAll<HTMLInputElement>('[data-interaction-name]')
      .forEach((input) =>
        input.addEventListener('change', () =>
          this.update(interactions, Number(input.dataset.interactionName), { name: input.value }),
        ),
      );
    list.querySelectorAll<HTMLSelectElement>('[data-interaction-trigger]').forEach((input) =>
      input.addEventListener('change', () =>
        this.update(interactions, Number(input.dataset.interactionTrigger), {
          trigger: input.value as InteractionTrigger,
        }),
      ),
    );
    list
      .querySelectorAll<HTMLSelectElement>('[data-interaction-action]')
      .forEach((input) =>
        input.addEventListener('change', () =>
          this.updateAction(
            interactions,
            Number(input.dataset.interactionAction),
            input.value as InteractionActionType,
          ),
        ),
      );
    list
      .querySelectorAll<HTMLInputElement>('[data-interaction-duration]')
      .forEach((input) =>
        input.addEventListener('change', () =>
          this.updateAction(
            interactions,
            Number(input.dataset.interactionDuration),
            undefined,
            Number(input.value),
          ),
        ),
      );
    list.querySelectorAll<HTMLInputElement>('[data-interaction-enabled]').forEach((input) =>
      input.addEventListener('change', () =>
        this.update(interactions, Number(input.dataset.interactionEnabled), {
          enabled: input.checked,
        }),
      ),
    );
    list.querySelectorAll<HTMLButtonElement>('[data-delete-interaction]').forEach((button) =>
      button.addEventListener('click', () => {
        interactions.splice(Number(button.dataset.deleteInteraction), 1);
        this.dirty();
        this.render(card);
      }),
    );
    list.querySelectorAll<HTMLButtonElement>('[data-duplicate-interaction]').forEach((button) =>
      button.addEventListener('click', () => {
        const index = Number(button.dataset.duplicateInteraction);
        const source = interactions[index];
        if (!source) return;
        const copy = structuredClone(source);
        copy.id = crypto.randomUUID();
        copy.name = `${copy.name} copy`;
        copy.actions = copy.actions.map((action) => ({ ...action, id: crypto.randomUUID() }));
        interactions.splice(index + 1, 0, copy);
        this.dirty();
        this.render(card);
      }),
    );
  }

  private update(
    interactions: NonNullable<WebKilnProject['editorSettings']>['interactions'],
    index: number,
    value: Record<string, unknown>,
  ): void {
    const item = interactions?.[index];
    if (!item) return;
    Object.assign(item, value);
    this.dirty();
  }

  private updateAction(
    interactions: NonNullable<WebKilnProject['editorSettings']>['interactions'],
    index: number,
    type?: InteractionActionType,
    duration?: number,
  ): void {
    const action = interactions?.[index]?.actions[0];
    if (!action) return;
    if (type) action.type = type;
    if (duration !== undefined) action.duration = Math.min(10000, Math.max(0, duration));
    this.dirty();
  }

  private label(items: Array<{ id: string; label: string }>, id: string): string {
    return items.find((item) => item.id === id)?.label ?? id;
  }
  private escape(value: string): string {
    return value.replace(
      /[&<>"']/g,
      (char) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
    );
  }
  private showMessage(card: HTMLElement, message: string): void {
    const help = card.querySelector<HTMLElement>('.field-help');
    if (help) help.textContent = message;
  }
}
