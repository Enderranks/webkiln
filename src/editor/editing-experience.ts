import type { Component } from 'grapesjs';
import { createDefaultEditorSettings } from '../models/project-schema';
import type { EditingMode, ResponsiveIntentKind, WebKilnProject } from '../types';
import {
  INTENT_LABELS,
  intentClass,
  normalizeEditorSettings,
  responsiveCss,
  setIntent,
  validateResponsive,
} from './responsive-intent';
import { GrapesJSEditorAdapter } from './grapesjs-adapter';

const intentOrder: ResponsiveIntentKind[] = [
  'stack-below',
  'full-width-small',
  'hide-at-breakpoint',
  'reorder-mobile',
  'maintain-aspect',
  'responsive-type',
  'horizontal-scroll',
  'mobile-navigation',
  'prioritize-content',
  'accordion',
  'keep-beside',
  'preserve-custom',
];

export class EditingExperienceController {
  private mode: EditingMode;
  private breakpoint = 'mobile';
  private compare = false;

  constructor(
    private readonly adapter: GrapesJSEditorAdapter,
    private readonly project: WebKilnProject,
    private readonly dirty: () => void,
  ) {
    this.project.editorSettings = normalizeEditorSettings(
      project.editorSettings ?? createDefaultEditorSettings(),
    );
    this.mode = this.project.editorSettings.mode;
  }

  start(): void {
    this.renderToolbar();
    this.renderGuidedPanel();
    this.bindMode();
    this.bindResponsiveControls();
    this.adapter.subscribe('select', () => this.renderResponsivePanel());
    this.applyStyles();
    this.updateModeUi();
  }

  private renderToolbar(): void {
    const topbar = document.querySelector('.topbar');
    if (!topbar || document.querySelector('[data-editing-experience]')) return;
    const wrap = document.createElement('div');
    wrap.dataset.editingExperience = 'true';
    wrap.className = 'editing-experience-toolbar';
    wrap.innerHTML = `<label class="mode-picker">Mode<select id="editingMode" aria-label="Editing mode"><option value="guided">Guided</option><option value="standard">Standard</option><option value="pro">Pro</option></select></label><div class="breakpoint-picker" role="group" aria-label="Responsive breakpoint"><button type="button" data-breakpoint="desktop">Desktop</button><button type="button" data-breakpoint="laptop">Laptop</button><button type="button" data-breakpoint="tablet">Tablet</button><button type="button" data-breakpoint="mobile">Mobile</button><button type="button" data-compare="true">Compare</button></div>`;
    topbar.insertBefore(wrap, topbar.querySelector('.top-actions'));
  }

  private renderGuidedPanel(): void {
    const panel = document.querySelector('#sitePanel');
    if (!panel || panel.querySelector('[data-guided-panel]')) return;
    const card = document.createElement('section');
    card.dataset.guidedPanel = 'true';
    card.className = 'guided-panel';
    card.innerHTML = `<p class="eyebrow">Guided editing</p><h3>Make the next good decision</h3><p class="panel-note">WebKiln keeps advanced controls out of the way while preserving every project value.</p><div class="guided-actions"><button type="button" data-guided-action="stack">Improve mobile layout</button><button type="button" data-guided-action="check">Check content</button></div><div class="content-checklist" aria-label="Content checklist"><label><input type="checkbox" /> Clear headline</label><label><input type="checkbox" /> One primary action</label><label><input type="checkbox" /> Image descriptions</label><label><input type="checkbox" /> Mobile preview checked</label></div>`;
    panel.prepend(card);
    card
      .querySelector('[data-guided-action="stack"]')
      ?.addEventListener('click', () => this.setSelectedIntent('stack-below'));
    card
      .querySelector('[data-guided-action="check"]')
      ?.addEventListener('click', () =>
        document.querySelector('#responsiveWarnings')?.scrollIntoView({ behavior: 'smooth' }),
      );
  }

  private bindMode(): void {
    document
      .querySelector<HTMLSelectElement>('#editingMode')
      ?.addEventListener('change', (event) => {
        this.mode = (event.target as HTMLSelectElement).value as EditingMode;
        this.project.editorSettings = { ...this.project.editorSettings!, mode: this.mode };
        this.updateModeUi();
        this.dirty();
      });
  }

  private bindResponsiveControls(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-breakpoint]').forEach((button) =>
      button.addEventListener('click', () => {
        this.breakpoint = button.dataset.breakpoint ?? 'mobile';
        document
          .querySelectorAll('[data-breakpoint]')
          .forEach((item) => item.classList.toggle('active', item === button));
        this.adapter.setDevice(this.breakpoint as 'desktop' | 'laptop' | 'tablet' | 'mobile');
        this.renderResponsivePanel();
      }),
    );
    document.querySelector('[data-compare]')?.addEventListener('click', (event) => {
      this.compare = !this.compare;
      (event.currentTarget as HTMLElement).classList.toggle('active', this.compare);
      document.body.classList.toggle('responsive-compare', this.compare);
    });
  }

  private renderResponsivePanel(): void {
    const inspector = document.querySelector('.inspector');
    if (!inspector) return;
    inspector.querySelector('[data-responsive-panel]')?.remove();
    const selected = this.adapter.getSelectedComponent() as Component | null;
    const id = this.adapter.getComponentId(selected);
    if (!id) return;
    const settings = this.project.editorSettings!;
    const metadata = settings.responsiveIntents[id] ?? { intents: [] };
    const section = document.createElement('section');
    section.dataset.responsivePanel = 'true';
    section.className = 'property-group responsive-panel';
    section.innerHTML = `<h3>Responsive intent · ${this.breakpoint}</h3><p class="field-help">Choose what should happen as the screen gets smaller. Settings inherit until you override them.</p><div class="intent-list">${intentOrder.map((kind) => `<label class="intent-row"><input type="checkbox" data-intent="${kind}" ${metadata.intents.some((item) => item.kind === kind && item.enabled && (item.breakpoint ?? 'mobile') === this.breakpoint) ? 'checked' : ''} /><span>${INTENT_LABELS[kind]}</span></label>`).join('')}</div><button type="button" class="ghost-btn" data-reset-breakpoint>Reset to inherited</button><div id="responsiveWarnings" class="responsive-warnings"></div>`;
    inspector.append(section);
    section
      .querySelectorAll<HTMLInputElement>('[data-intent]')
      .forEach((input) =>
        input.addEventListener('change', () =>
          this.setSelectedIntent(input.dataset.intent as ResponsiveIntentKind, input.checked),
        ),
      );
    section.querySelector('[data-reset-breakpoint]')?.addEventListener('click', () => {
      this.project.editorSettings!.responsiveIntents[id] = {
        intents: metadata.intents.filter((item) => item.breakpoint !== this.breakpoint),
        overrides: { ...(metadata.overrides ?? {}), [this.breakpoint]: false },
      };
      this.applyStyles();
      this.dirty();
      this.renderResponsivePanel();
    });
    const warnings = validateResponsive(metadata);
    section.querySelector('#responsiveWarnings')!.textContent = warnings
      .map((item) => item.message)
      .join(' ');
  }

  private setSelectedIntent(kind: ResponsiveIntentKind, enabled = true): void {
    const id = this.adapter.getComponentId(this.adapter.getSelectedComponent() as Component | null);
    if (!id) return;
    const component = this.adapter.getSelectedComponent() as Component | null;
    component?.addClass(intentClass(id));
    this.project.editorSettings = setIntent(this.project.editorSettings!, id, {
      kind,
      enabled,
      breakpoint: this.breakpoint,
      source: this.mode,
    });
    this.applyStyles();
    this.dirty();
    this.renderResponsivePanel();
  }

  private applyStyles(): void {
    const settings = this.project.editorSettings!;
    const css = Object.entries(settings.responsiveIntents)
      .map(([id, metadata]) => responsiveCss(id, metadata, settings.breakpoints))
      .filter(Boolean)
      .join('\n');
    if (css) this.adapter.addResponsiveStyles(css);
  }

  private updateModeUi(): void {
    document.documentElement.dataset.editingMode = this.mode;
    const select = document.querySelector<HTMLSelectElement>('#editingMode');
    if (select) select.value = this.mode;
    document.querySelector('.inspector')?.classList.toggle('guided-mode', this.mode === 'guided');
    document.querySelector('.inspector')?.classList.toggle('pro-mode', this.mode === 'pro');
    const description = document.querySelector('#modeDescription');
    if (description)
      description.textContent =
        this.mode === 'guided'
          ? 'Simple controls and safe recommendations'
          : this.mode === 'pro'
            ? 'Full layout, code, and CSS controls'
            : 'Visual editing with responsive controls';
  }
}
