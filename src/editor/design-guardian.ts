import { createDefaultEditorSettings } from '../models/project-schema';
import type { DesignSystem, WebKilnProject } from '../types';
import {
  healthScores,
  normalizeDesignSystem,
  scanDesignGuardian,
  tokenCss,
  tokenUsageCount,
} from './design-system';
import { GrapesJSEditorAdapter } from './grapesjs-adapter';

export class DesignGuardianController {
  private system: DesignSystem;
  constructor(
    private readonly adapter: GrapesJSEditorAdapter,
    private readonly project: WebKilnProject,
    private readonly dirty: () => void,
  ) {
    project.editorSettings ??= createDefaultEditorSettings();
    this.system = normalizeDesignSystem(project.editorSettings.designSystem);
    project.editorSettings.designSystem = this.system;
  }
  start(): void {
    this.render();
    this.applyTokens();
  }
  private render(): void {
    const panel = document.querySelector('#sitePanel');
    if (!panel || panel.querySelector('[data-v14-panel]')) return;
    const card = document.createElement('section');
    card.dataset.v14Panel = 'true';
    card.className = 'v14-health-card';
    card.innerHTML = `<div class="v14-head"><div><p class="eyebrow">V14 system</p><h3>Design system</h3></div><button class="ghost-btn" type="button" data-theme-export>Export</button></div><p class="panel-note">Tokens keep colors, type, spacing, controls, motion, and layout consistent across the site.</p><div class="token-list">${this.system.tokens.map((token) => `<label class="token-row"><span><strong>${token.name}</strong><small>${token.category} · ${tokenUsageCount(this.project, token)} uses</small></span><input data-token="${token.name}" value="${token.value}" aria-label="${token.name}" /></label>`).join('')}</div><div class="v14-actions"><button class="primary-btn" type="button" data-run-guardian>Run Design Guardian</button><button class="ghost-btn" type="button" data-run-health>Site Health Center</button></div><div data-v14-results aria-live="polite"></div>`;
    panel.append(card);
    card.querySelectorAll<HTMLInputElement>('[data-token]').forEach((input) =>
      input.addEventListener('change', () => {
        const token = this.system.tokens.find((item) => item.name === input.dataset.token);
        if (token) token.value = input.value;
        this.persist();
      }),
    );
    card
      .querySelector('[data-run-guardian]')
      ?.addEventListener('click', () => this.renderGuardian(card));
    card
      .querySelector('[data-run-health]')
      ?.addEventListener('click', () => this.renderHealth(card));
    card
      .querySelector('[data-theme-export]')
      ?.addEventListener('click', () => this.downloadTheme());
  }
  private persist(): void {
    this.project.editorSettings!.designSystem = this.system;
    this.applyTokens();
    this.dirty();
    this.render();
  }
  private applyTokens(): void {
    this.adapter.addResponsiveStyles(tokenCss(this.system));
  }
  private renderGuardian(card: HTMLElement): void {
    const results = card.querySelector<HTMLElement>('[data-v14-results]');
    if (!results) return;
    const findings = scanDesignGuardian(this.project);
    results.innerHTML = `<h4>Design Guardian · ${findings.length} findings</h4>${findings.length ? findings.map((item) => `<article class="guardian-finding ${item.severity}"><strong>${item.severity.toUpperCase()} · ${item.pageName}</strong><p>${item.explanation}</p><small>Suggested fix: ${item.suggestedFix}</small>${item.safe ? `<button type="button" data-fix="${item.id}">Apply safe fix</button>` : '<em>Manual review required</em>'}</article>`).join('') : '<p class="health-good">No findings in the available project data.</p>'}`;
    results.querySelectorAll<HTMLButtonElement>('[data-fix]').forEach((button) =>
      button.addEventListener('click', () => {
        const finding = findings.find((item) => item.id === button.dataset.fix);
        const page = this.project.pages.find((item) => item.id === finding?.pageId);
        if (page && finding?.id.startsWith('unsafe-'))
          page.projectData = JSON.parse(
            JSON.stringify(page.projectData)
              .replace(/onclick\s*=\s*"[^"]*"/gi, '')
              .replace(/javascript:/gi, ''),
          );
        this.dirty();
        this.renderGuardian(card);
      }),
    );
  }
  private renderHealth(card: HTMLElement): void {
    const results = card.querySelector<HTMLElement>('[data-v14-results]');
    if (!results) return;
    const scores = healthScores(this.project);
    results.innerHTML = `<h4>Site Health Center</h4>${Object.entries(scores)
      .map(
        ([name, value]) =>
          `<div class="health-row"><span><strong>${name}</strong><small>${value.basis}</small></span><b>${value.score === null ? 'Unavailable' : `${value.score}/100`}</b></div>`,
      )
      .join('')}`;
  }
  private downloadTheme(): void {
    const blob = new Blob([JSON.stringify(this.system, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'webkiln-theme.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }
}
