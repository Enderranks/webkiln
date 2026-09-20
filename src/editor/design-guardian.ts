import { createDefaultEditorSettings } from '../models/project-schema';
import type { DesignSystem, WebKilnProject } from '../types';
import {
  healthScores,
  findTokenUsages,
  normalizeDesignSystem,
  replaceTokenAcrossSite,
  scanDesignGuardian,
  tokenCss,
  tokenUsageCount,
} from './design-system';
import { WebKilnEditorAdapter } from './webkiln-editor-adapter';

export class DesignGuardianController {
  private system: DesignSystem;
  private readonly dismissed = new Map<string, string>();
  constructor(
    private readonly adapter: WebKilnEditorAdapter,
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
    card.innerHTML = `<div class="v14-head"><div><p class="eyebrow">V14 system</p><h3>Design system</h3></div><div class="v14-head-actions"><button class="ghost-btn" type="button" data-theme-import>Import</button><button class="ghost-btn" type="button" data-theme-export>Export</button><input type="file" accept="application/json" data-theme-file hidden /></div></div><p class="panel-note">Tokens keep colors, type, spacing, controls, motion, and layout consistent across the site.</p><div class="token-list">${this.system.tokens.map((token) => `<div class="token-row"><label><span><strong>${token.name}</strong><small>${token.category} · <button type="button" class="token-usage" data-token-usage="${token.name}">${tokenUsageCount(this.project, token)} uses</button></small></span><input data-token="${token.name}" value="${token.value}" aria-label="${token.name}" /></label><button type="button" class="mini-btn" data-token-replace="${token.name}" aria-label="Replace ${token.name} across site">↻</button></div>`).join('')}</div><div class="v14-actions"><button class="primary-btn" type="button" data-run-guardian>Run Design Guardian</button><button class="ghost-btn" type="button" data-run-health>Site Health Center</button></div><div data-v14-results aria-live="polite"></div>`;
    panel.append(card);
    card.querySelectorAll<HTMLInputElement>('[data-token]').forEach((input) =>
      input.addEventListener('change', () => {
        const token = this.system.tokens.find((item) => item.name === input.dataset.token);
        if (token) token.value = input.value;
        this.persist();
      }),
    );
    card.querySelectorAll<HTMLButtonElement>('[data-token-usage]').forEach((button) =>
      button.addEventListener('click', () => {
        const token = this.system.tokens.find((item) => item.name === button.dataset.tokenUsage);
        if (!token) return;
        const usages = findTokenUsages(this.project, token);
        this.showTokenResult(
          card,
          usages.length
            ? usages.map((item) => `${item.pageName}: ${item.count}`).join(' · ')
            : 'No page content uses this value yet.',
        );
      }),
    );
    card.querySelectorAll<HTMLButtonElement>('[data-token-replace]').forEach((button) =>
      button.addEventListener('click', () => {
        const token = this.system.tokens.find((item) => item.name === button.dataset.tokenReplace);
        if (!token) return;
        const replacement = window.prompt(
          `Replace ${token.value} across the site with:`,
          token.value,
        );
        if (replacement === null || replacement === token.value) return;
        if (!window.confirm(`Replace every use of ${token.value} in page content?`)) return;
        const result = replaceTokenAcrossSite(this.project, token, replacement);
        this.project.pages = result.project.pages;
        this.persist();
        this.showTokenResult(
          card,
          `${result.replacements} replacement${result.replacements === 1 ? '' : 's'} applied across page content.`,
        );
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
    card
      .querySelector('[data-theme-import]')
      ?.addEventListener('click', () =>
        card.querySelector<HTMLInputElement>('[data-theme-file]')?.click(),
      );
    card
      .querySelector<HTMLInputElement>('[data-theme-file]')
      ?.addEventListener('change', async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;
        try {
          this.system = normalizeDesignSystem(JSON.parse(await file.text()) as DesignSystem);
          this.persist();
        } catch {
          this.toast('Theme import failed', 'Choose a valid WebKiln theme JSON file.');
        }
      });
  }
  private showTokenResult(card: HTMLElement, message: string): void {
    const results = card.querySelector<HTMLElement>('[data-v14-results]');
    if (results) results.innerHTML = `<p class="health-good">${message}</p>`;
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
    const findings = scanDesignGuardian(this.project).filter(
      (item) => !this.dismissed.has(item.id),
    );
    results.innerHTML = `<div class="guardian-results-head"><h4>Design Guardian · ${findings.length} findings</h4>${findings.some((item) => item.safe) ? '<button type="button" class="ghost-btn" data-fix-all>Apply all safe fixes</button>' : ''}</div>${findings.length ? findings.map((item) => `<article class="guardian-finding ${item.severity}"><strong>${item.severity.toUpperCase()} · ${item.pageName}</strong><small>Affected component: ${item.affectedComponent}</small><p>${item.explanation}</p><small>Suggested fix: ${item.suggestedFix}</small><div class="guardian-actions"><button type="button" data-select-finding="${item.id}">Select component</button>${item.safe ? `<button type="button" data-fix="${item.id}">Apply safe fix</button>` : ''}<button type="button" data-dismiss-finding="${item.id}">Dismiss</button></div></article>`).join('') : '<p class="health-good">No findings in the available project data.</p>'}`;
    results.querySelector('[data-fix-all]')?.addEventListener('click', () => {
      findings.filter((item) => item.safe).forEach((item) => this.applyFix(item));
      this.dirty();
      this.renderGuardian(card);
    });
    results.querySelectorAll<HTMLButtonElement>('[data-fix]').forEach((button) =>
      button.addEventListener('click', () => {
        const finding = findings.find((item) => item.id === button.dataset.fix);
        if (finding) this.applyFix(finding);
        this.dirty();
        this.renderGuardian(card);
      }),
    );
    results.querySelectorAll<HTMLButtonElement>('[data-dismiss-finding]').forEach((button) =>
      button.addEventListener('click', () => {
        const reason = window.prompt('Why dismiss this finding?');
        if (reason?.trim()) {
          this.dismissed.set(button.dataset.dismissFinding ?? '', reason.trim());
          this.renderGuardian(card);
        }
      }),
    );
    results.querySelectorAll<HTMLButtonElement>('[data-select-finding]').forEach((button) =>
      button.addEventListener('click', () => {
        const finding = findings.find((item) => item.id === button.dataset.selectFinding);
        const page = this.project.pages.find((item) => item.id === finding?.pageId);
        if (page) {
          this.project.currentPageId = page.id;
          this.toast(
            'Component located',
            `${finding?.affectedComponent ?? 'Finding'} is on ${page.name}.`,
          );
        }
      }),
    );
  }

  private applyFix(finding: ReturnType<typeof scanDesignGuardian>[number]): void {
    const page = this.project.pages.find((item) => item.id === finding.pageId);
    if (page && finding.id.startsWith('unsafe-'))
      page.projectData = JSON.parse(
        JSON.stringify(page.projectData)
          .replace(/onclick\s*=\s*"[^"]*"/gi, '')
          .replace(/javascript:/gi, ''),
      );
  }

  private toast(title: string, detail: string): void {
    const toast = document.querySelector('#toast');
    toast?.querySelector('strong')?.replaceChildren(document.createTextNode(title));
    toast?.querySelector('small')?.replaceChildren(document.createTextNode(detail));
    toast?.classList.add('show');
    window.setTimeout(() => toast?.classList.remove('show'), 2600);
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
