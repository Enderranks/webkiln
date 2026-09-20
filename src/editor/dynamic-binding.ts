import type { Component } from 'grapesjs';
import type { CmsCollection } from '../cloud/contracts';
import type { WebKilnApiClient } from '../cloud/api-client';
import { WebKilnEditorAdapter } from './webkiln-editor-adapter';

export class DynamicBindingController {
  private collections: CmsCollection[] = [];
  constructor(
    private readonly adapter: WebKilnEditorAdapter,
    private readonly cloud: WebKilnApiClient,
    private readonly workspaceId: string,
    private readonly dirty: () => void,
  ) {}
  async start(): Promise<void> {
    try {
      this.collections = await this.cloud.listCollections(this.workspaceId);
    } catch {
      this.collections = [];
    }
    this.render();
    this.adapter.subscribe('select', () => this.render());
  }
  private render(): void {
    const panel = document.querySelector('#sitePanel');
    if (!panel) return;
    panel.querySelector('[data-dynamic-binding]')?.remove();
    const selected = this.adapter.getSelectedComponent() as Component | null;
    const attrs = (selected?.getAttributes?.() ?? {}) as Record<string, string>;
    const card = document.createElement('section');
    card.dataset.dynamicBinding = 'true';
    card.className = 'recovery-card dynamic-binding-card';
    card.innerHTML = `<strong>Dynamic content</strong><small>Bind this component to a CMS collection or use it as a repeating list.</small><label class="field">Data source<select data-bind-collection><option value="">Choose collection</option>${this.collections.map((collection) => `<option value="${collection.id}" ${attrs['data-wk-collection'] === collection.id ? 'selected' : ''}>${collection.name}</option>`).join('')}</select></label><label class="field">Field<select data-bind-field><option value="">Choose field</option></select></label><label class="field">Fallback content<input data-bind-fallback value="${attrs['data-wk-fallback'] ?? ''}" placeholder="Shown when empty" /></label><label class="field">Empty behavior<select data-bind-empty><option value="hide">Hide element</option><option value="fallback">Use fallback</option><option value="empty">Show empty state</option></select></label><label class="toggle-row"><span>Repeating list</span><input type="checkbox" data-bind-repeat ${attrs['data-wk-repeat'] === 'true' ? 'checked' : ''} /></label><button type="button" class="primary-btn" data-save-binding>Save binding</button><p class="panel-note">Preview record and formatting are applied at publish time from published CMS records only.</p>`;
    panel.append(card);
    const collectionSelect = card.querySelector<HTMLSelectElement>('[data-bind-collection]');
    const fieldSelect = card.querySelector<HTMLSelectElement>('[data-bind-field]');
    const populateFields = () => {
      const collection = this.collections.find((item) => item.id === collectionSelect?.value);
      if (fieldSelect)
        fieldSelect.innerHTML = `<option value="">Choose field</option>${(collection?.fields ?? []).map((field) => `<option value="${field.slug}" ${attrs['data-wk-field'] === field.slug ? 'selected' : ''}>${field.name}</option>`).join('')}`;
    };
    collectionSelect?.addEventListener('change', populateFields);
    populateFields();
    card.querySelector('[data-save-binding]')?.addEventListener('click', () => {
      if (!selected) return;
      selected.addAttributes({
        'data-wk-collection': collectionSelect?.value ?? '',
        'data-wk-field': fieldSelect?.value ?? '',
        'data-wk-fallback':
          card.querySelector<HTMLInputElement>('[data-bind-fallback]')?.value ?? '',
        'data-wk-empty':
          card.querySelector<HTMLSelectElement>('[data-bind-empty]')?.value ?? 'hide',
        'data-wk-repeat': String(
          card.querySelector<HTMLInputElement>('[data-bind-repeat]')?.checked ?? false,
        ),
      });
      this.dirty();
      this.render();
    });
  }
}
