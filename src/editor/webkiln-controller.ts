import type { Component } from 'grapesjs';
import { getComponentDefinition } from '../components-registry/registry';
import type { DeviceId, WebKilnProject } from '../types';
import type { LocalProjectStorage } from '../storage/project-storage';
import { WebKilnEditorAdapter } from './webkiln-editor-adapter';
import {
  duplicatePage,
  newPage,
  removePage,
  restorePage,
  setHomepage,
  uniqueSlug,
} from '../models/page-manager';

const blockMap: Record<string, string> = {
  hero: 'hero',
  features: 'columns',
  pricing: 'pricing',
  games: 'gallery',
  quote: 'contact',
  media: 'gallery',
  form: 'contact',
  footer: 'section',
};

const deviceWidths: Record<DeviceId, number> = {
  desktop: 1200,
  laptop: 1024,
  tablet: 768,
  mobile: 390,
};

function firstComponent(value: unknown): Component | null {
  if (!value) return null;
  return Array.isArray(value)
    ? ((value[0] as Component | undefined) ?? null)
    : (value as Component);
}

function componentLabel(component: Component | null): string {
  if (!component) return 'Page';
  return String(component.get('name') || component.get('tagName') || 'Element');
}

export class WebKilnEditorController {
  private selected: Component | null = null;
  private saveTimer: number | undefined;
  private device: DeviceId = 'desktop';
  private previewing = false;
  private expandedLayerIds = new Set<string>();
  private clipboard: Component | null = null;
  private draggedLayerId: string | null = null;
  private readonly commands = [
    ['add-section', 'Add section', 'Insert a new hero section'],
    ['add-component', 'Add component', 'Open reusable components'],
    ['switch-page', 'Switch page', 'Open the page manager'],
    ['switch-breakpoint', 'Switch breakpoint', 'Open responsive controls'],
    ['open-layers', 'Open layers', 'Inspect and reorder page layers'],
    ['open-design', 'Open design system', 'Open site theme controls'],
    ['open-health', 'Open site health', 'Open site settings and checks'],
    ['preview', 'Preview', 'Preview the current page'],
    ['publish', 'Publish', 'Save a publish checkpoint'],
    ['save-revision', 'Save revision', 'Create a named local checkpoint'],
    ['search-settings', 'Search settings', 'Open site settings'],
  ] as const;

  constructor(
    private readonly adapter: WebKilnEditorAdapter,
    private readonly project: WebKilnProject,
    private readonly storage: LocalProjectStorage,
  ) {}

  start(): void {
    this.bindShell();
    this.bindBlocks();
    this.bindPages();
    this.bindInspector();
    this.bindLayers();
    this.adapter.subscribe('select', (component) =>
      this.onSelect((component as Component) ?? null),
    );
    this.adapter.subscribe('update', () => this.scheduleSave());
    this.adapter.subscribe('device', (device) => this.setCanvasStatus(device as DeviceId));
    this.onSelect(this.adapter.getSelectedComponent());
    this.renderLayers();
    this.renderPages();
    this.scheduleSave();
  }

  private bindShell(): void {
    document.querySelector('#undoBtn')?.addEventListener('click', () => this.adapter.undo());
    document.querySelector('#redoBtn')?.addEventListener('click', () => this.adapter.redo());
    document
      .querySelectorAll<HTMLButtonElement>('.device')
      .forEach((button) =>
        button.addEventListener('click', () => this.setDevice(button.dataset.width as DeviceId)),
      );
    document.querySelector('#zoomOut')?.addEventListener('click', () => this.changeZoom(-10));
    document.querySelector('#zoomIn')?.addEventListener('click', () => this.changeZoom(10));
    document.querySelector('#deleteBtn')?.addEventListener('click', () => this.deleteSelected());
    document
      .querySelector('.outline-btn')
      ?.addEventListener('click', () => this.duplicateSelected());
    document.querySelector('#previewBtn')?.addEventListener('click', () => this.togglePreview());
    document
      .querySelector('#publishBtn')
      ?.addEventListener('click', () => this.saveNow('Published checkpoint'));
    document.addEventListener('keydown', (event) => this.handleShortcut(event));
    this.bindCommandPalette();
    document.querySelectorAll<HTMLButtonElement>('.rail-tab').forEach((button) =>
      button.addEventListener('click', () => {
        document.querySelectorAll('.rail-tab').forEach((item) => item.classList.remove('active'));
        document.querySelectorAll('.panel').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        document.querySelector(`#${button.dataset.panel}Panel`)?.classList.add('active');
      }),
    );
    document
      .querySelector('#aiStarterBtn')
      ?.addEventListener('click', () => this.addBlock('features'));
    document.querySelector('#themeColor')?.addEventListener('input', (event) => {
      const value = (event.target as HTMLInputElement).value;
      document.documentElement.style.setProperty('--gold', value);
      this.project.themeTokens.primary = value;
      this.scheduleSave();
    });
    document.querySelector('#radiusSelect')?.addEventListener('change', (event) => {
      const value = (event.target as HTMLSelectElement).value;
      document.documentElement.style.setProperty('--radius', `${value}px`);
      this.project.themeTokens.radius = `${value}px`;
      this.scheduleSave();
    });
    document
      .querySelector('#checkpointBtn')
      ?.addEventListener('click', () => this.saveNow('Named checkpoint'));
    this.bindCustomCode();
    this.bindRecovery();
  }

  private bindCommandPalette(): void {
    document
      .querySelector('#commandBtn')
      ?.addEventListener('click', () => this.openCommandPalette());
    document
      .querySelector('#closeCommand')
      ?.addEventListener('click', () => this.closeCommandPalette());
    document.querySelector('#commandPalette')?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) this.closeCommandPalette();
    });
    document.querySelector('#commandSearch')?.addEventListener('input', (event) => {
      this.renderCommandList((event.target as HTMLInputElement).value);
    });
    document.querySelector('#commandList')?.addEventListener('click', (event) => {
      const command = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-command]');
      if (command) this.executeCommand(command.dataset.command ?? '');
    });
  }

  private openCommandPalette(): void {
    const palette = document.querySelector<HTMLElement>('#commandPalette');
    if (!palette) return;
    palette.hidden = false;
    this.renderCommandList();
    document.querySelector<HTMLInputElement>('#commandSearch')?.focus();
  }

  private closeCommandPalette(): void {
    const palette = document.querySelector<HTMLElement>('#commandPalette');
    if (palette) palette.hidden = true;
  }

  private renderCommandList(query = ''): void {
    const list = document.querySelector<HTMLElement>('#commandList');
    if (!list) return;
    const normalized = query.trim().toLowerCase();
    const commands = this.commands.filter(([id, label, description]) =>
      `${id} ${label} ${description}`.toLowerCase().includes(normalized),
    );
    list.innerHTML = commands.length
      ? commands
          .map(
            ([id, label, description]) =>
              `<button type="button" data-command="${id}" role="option"><strong>${label}</strong><small>${description}</small></button>`,
          )
          .join('')
      : '<p class="command-empty">No matching commands</p>';
  }

  private executeCommand(command: string): void {
    this.closeCommandPalette();
    if (command === 'add-section') this.addBlock('hero');
    if (command === 'add-component') this.openPanel('components');
    if (command === 'switch-page') this.openPanel('pages');
    if (command === 'switch-breakpoint')
      document
        .querySelector<HTMLElement>('.editing-experience-toolbar')
        ?.scrollIntoView({ behavior: 'smooth' });
    if (command === 'open-layers') this.openPanel('layers');
    if (command === 'open-design') this.openPanel('theme');
    if (command === 'open-health' || command === 'search-settings') this.openPanel('site');
    if (command === 'preview') this.togglePreview();
    if (command === 'publish') this.saveNow('Published checkpoint');
    if (command === 'save-revision') this.saveNow('Named checkpoint');
  }

  private openPanel(panel: string): void {
    document
      .querySelectorAll('.rail-tab')
      .forEach((item) =>
        item.classList.toggle('active', (item as HTMLElement).dataset.panel === panel),
      );
    document
      .querySelectorAll('.panel')
      .forEach((item) => item.classList.toggle('active', item.id === `${panel}Panel`));
  }

  private bindBlocks(): void {
    const search = document.querySelector<HTMLInputElement>('#blockSearch');
    search?.addEventListener('input', () => {
      const query = search.value.toLowerCase();
      document.querySelectorAll<HTMLElement>('.block-card').forEach((card) => {
        card.hidden = !card.innerText.toLowerCase().includes(query);
      });
    });
    document.querySelectorAll<HTMLButtonElement>('.chip').forEach((chip) =>
      chip.addEventListener('click', () => {
        document.querySelectorAll('.chip').forEach((item) => item.classList.remove('active'));
        chip.classList.add('active');
        document.querySelectorAll<HTMLElement>('.block-card').forEach((card) => {
          card.hidden =
            chip.dataset.filter !== 'all' && card.dataset.category !== chip.dataset.filter;
        });
      }),
    );
    document.querySelectorAll<HTMLElement>('.block-card').forEach((card) => {
      card.addEventListener('click', () => this.addBlock(card.dataset.type ?? 'hero'));
      card.addEventListener('dragstart', (event) => {
        event.dataTransfer?.setData('text/plain', card.dataset.type ?? 'hero');
      });
    });
    const canvasWrap = document.querySelector('#canvasWrap');
    canvasWrap?.addEventListener('dragover', (event) => {
      event.preventDefault();
      canvasWrap.classList.add('drop-ready');
    });
    canvasWrap?.addEventListener('dragleave', () => canvasWrap.classList.remove('drop-ready'));
    canvasWrap?.addEventListener('drop', (event) => {
      const dropEvent = event as DragEvent;
      event.preventDefault();
      canvasWrap.classList.remove('drop-ready');
      this.addBlock(dropEvent.dataTransfer?.getData('text/plain') ?? 'hero');
    });
    document
      .querySelectorAll<HTMLButtonElement>('.component-row')
      .forEach((row) =>
        row.addEventListener('click', () => this.addDefinition(row.dataset.component ?? 'heading')),
      );
  }

  private bindPages(): void {
    document
      .querySelector('#pagesPanel .mini-btn')
      ?.addEventListener('click', () => this.createPage());
    document.querySelector('#pagesPanel')?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-page-action]');
      if (!button) return;
      const page = this.project.pages.find((item) => item.id === button.dataset.pageId);
      if (!page) return;
      const action = button.dataset.pageAction;
      if (action === 'open') this.switchPage(page.id);
      if (action === 'home') {
        setHomepage(this.project, page.id);
        this.renderPages();
        this.saveNow('Homepage changed');
      }
      if (action === 'duplicate') {
        const copy = duplicatePage(this.project, page);
        this.renderPages();
        this.switchPage(copy.id);
      }
      if (action === 'delete') this.deletePage(page.id);
      if (action === 'up' || action === 'down') this.reorderPage(page.id, action === 'up' ? -1 : 1);
      if (action === 'restore') {
        restorePage(this.project, page.id);
        this.renderPages();
        this.saveNow('Page restored');
      }
    });
  }

  private bindInspector(): void {
    const spacing = document.querySelector<HTMLInputElement>('#spacingRange');
    spacing?.addEventListener('input', () => {
      if (!this.selected) return;
      this.adapter.updateStyles(this.selected, {
        'padding-top': `${spacing.value}px`,
        'padding-bottom': `${spacing.value}px`,
      });
      document
        .querySelector('#spacingValue')
        ?.replaceChildren(document.createTextNode(`${spacing.value} px`));
    });
    document
      .querySelector('#bgColor')
      ?.addEventListener('input', (event) =>
        this.updateColor('background-color', (event.target as HTMLInputElement).value, '#bgValue'),
      );
    document
      .querySelector('#textColor')
      ?.addEventListener('input', (event) =>
        this.updateColor('color', (event.target as HTMLInputElement).value, '#textValue'),
      );
    document.querySelectorAll<HTMLInputElement>('.toggle-row input').forEach((toggle, index) =>
      toggle.addEventListener('change', () => {
        if (!this.selected) return;
        const device = index === 0 ? 'desktop' : 'mobile';
        this.adapter.updateStyles(this.selected as Component, {
          [`display-${device}`]: toggle.checked ? 'block' : 'none',
        });
      }),
    );
    document.querySelectorAll<HTMLButtonElement>('.inspector-tabs button').forEach((tab) =>
      tab.addEventListener('click', () => {
        document
          .querySelectorAll('.inspector-tabs button')
          .forEach((item) => item.classList.remove('active'));
        tab.classList.add('active');
        this.renderDynamicInspector(tab.textContent?.toLowerCase() ?? 'content');
      }),
    );
  }

  private bindLayers(): void {
    document.querySelector('#collapseLayers')?.addEventListener('click', () => {
      document.querySelector('#layerList')?.classList.toggle('is-collapsed');
    });
    document.querySelector('#layerList')?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const action = target.closest<HTMLButtonElement>('[data-layer-action]');
      const row = target.closest<HTMLElement>('[data-component-id]');
      if (!row) return;
      const component = this.findById(row.dataset.componentId ?? '');
      if (!component) return;
      if (action) {
        this.layerAction(action.dataset.layerAction ?? '', component);
        return;
      }
      if ((target as HTMLElement).closest('[data-layer-toggle]')) {
        this.toggleLayer(component.getId());
        return;
      }
      this.adapter.selectComponent(component);
    });
    document.querySelector('#layerList')?.addEventListener('dragstart', (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-component-id]');
      if (row) this.draggedLayerId = row.dataset.componentId ?? null;
    });
    document.querySelector('#layerList')?.addEventListener('dragover', (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-component-id]');
      if (!row || !this.draggedLayerId) return;
      const target = this.findById(row.dataset.componentId ?? '');
      const dragged = this.findById(this.draggedLayerId);
      if (!target || !dragged || !this.canDrop(dragged, target)) return;
      event.preventDefault();
      row.dataset.dropValid = 'true';
    });
    document.querySelector('#layerList')?.addEventListener('drop', (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-component-id]');
      const target = row && this.findById(row.dataset.componentId ?? '');
      const dragged = this.draggedLayerId && this.findById(this.draggedLayerId);
      if (target && dragged && this.canDrop(dragged, target)) {
        event.preventDefault();
        dragged.move(target, { at: target.components().length });
        this.scheduleSave();
      }
      this.draggedLayerId = null;
    });
  }

  private addBlock(type: string): void {
    this.addDefinition(blockMap[type] ?? type);
  }

  private addDefinition(type: string): void {
    const definition = getComponentDefinition(type);
    if (!definition) return;
    const parent = this.selected && this.isContainer(this.selected) ? this.selected : undefined;
    const created = firstComponent(this.adapter.addComponent(definition.defaultContent, parent));
    if (created) {
      created.set({ name: definition.displayName, type: definition.id });
      this.adapter.selectComponent(created);
      this.toast(`${definition.displayName} added`, 'The new component is selected on the canvas.');
    }
  }

  private isContainer(component: Component): boolean {
    const tag = String(component.get('tagName') || '').toLowerCase();
    return ['body', 'div', 'section', 'main', 'header', 'footer', 'form'].includes(tag);
  }

  private onSelect(component: Component | null): void {
    this.selected = component;
    const label = componentLabel(component);
    document.querySelector('#inspectorTitle')?.replaceChildren(document.createTextNode(label));
    document.querySelector('#selectionLabel')?.replaceChildren(document.createTextNode(label));
    document.querySelector('#elementPath')?.replaceChildren(document.createTextNode(label));
    document
      .querySelector('#selectionStatus')
      ?.replaceChildren(document.createTextNode(`${label} selected`));
    this.syncBasicInspector(component);
    this.renderLayers();
    this.renderDynamicInspector('content');
  }

  private syncBasicInspector(component: Component | null): void {
    if (!component) return;
    const styles = component.getStyle() as Record<string, string>;
    const bg = styles['background-color'] || '#0b0d0f';
    const color = styles.color || '#f7f7f5';
    const bgInput = document.querySelector<HTMLInputElement>('#bgColor');
    const textInput = document.querySelector<HTMLInputElement>('#textColor');
    if (bgInput) bgInput.value = this.toHex(bg);
    if (textInput) textInput.value = this.toHex(color);
    document.querySelector('#bgValue')?.replaceChildren(document.createTextNode(bg.toUpperCase()));
    document
      .querySelector('#textValue')
      ?.replaceChildren(document.createTextNode(color.toUpperCase()));
    const spacing = Number.parseInt(styles['padding-top'] || '60', 10);
    const spacingInput = document.querySelector<HTMLInputElement>('#spacingRange');
    if (spacingInput) spacingInput.value = String(Number.isNaN(spacing) ? 60 : spacing);
    document
      .querySelector('#spacingValue')
      ?.replaceChildren(document.createTextNode(`${spacing || 60} px`));
  }

  private renderDynamicInspector(tab: string): void {
    let host = document.querySelector<HTMLElement>('#dynamicInspector');
    if (!host) {
      host = document.createElement('div');
      host.id = 'dynamicInspector';
      document.querySelector('.inspector')?.append(host);
    }
    host.replaceChildren();
    if (!this.selected) return;
    this.renderSmartSectionInspector(host);
    if (tab === 'content') this.renderContentControls(host);
    if (tab === 'advanced') this.renderAdvancedControls(host);
  }

  private renderSmartSectionInspector(host: HTMLElement): void {
    if (!this.selected) return;
    const attributes = (this.selected.getAttributes?.() ?? {}) as Record<string, string>;
    const type = attributes['data-wk-smart'] || String(this.selected.get('type') || '');
    const smart = getComponentDefinition(type)?.smartSection;
    if (!smart) return;
    const card = document.createElement('section');
    card.className = 'smart-inspector';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'Smart section';
    const title = document.createElement('strong');
    title.textContent = getComponentDefinition(type)?.displayName ?? 'Smart section';
    const purpose = document.createElement('p');
    purpose.className = 'panel-note';
    purpose.textContent = smart.purpose;
    const variantLabel = document.createElement('label');
    variantLabel.className = 'field dynamic-field';
    variantLabel.textContent = 'Layout variant';
    const variant = document.createElement('select');
    smart.variants.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name.charAt(0).toUpperCase() + name.slice(1);
      option.selected = attributes['data-wk-variant'] === name;
      variant.append(option);
    });
    variantLabel.append(variant);
    variant.addEventListener('change', () => {
      this.selected?.addAttributes({ 'data-wk-variant': variant.value });
      this.scheduleSave();
      this.toast('Smart section updated', `${variant.value} layout variant applied.`);
    });
    const checklist = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Content checklist';
    checklist.append(summary);
    const list = document.createElement('ul');
    smart.requiredContent.forEach((item) => {
      const entry = document.createElement('li');
      entry.textContent = item;
      list.append(entry);
    });
    checklist.append(list);
    card.append(eyebrow, title, purpose, variantLabel, checklist);
    if (smart.dataSource) {
      const source = document.createElement('small');
      source.textContent = `Data source: ${smart.dataSource}`;
      card.append(source);
    }
    host.append(card);
  }

  private renderContentControls(host: HTMLElement): void {
    const tag = String(this.selected?.get('tagName') || '').toLowerCase();
    const textComponent = ['h1', 'h2', 'h3', 'h4', 'p', 'span', 'a', 'button'].includes(tag);
    if (textComponent) {
      const label = document.createElement('label');
      label.className = 'field dynamic-field';
      label.textContent = 'Text';
      const input = document.createElement('textarea');
      input.value = this.selected?.getInnerHTML?.() ?? '';
      input.addEventListener('input', () => this.selected?.components(input.value));
      label.append(input);
      host.append(label);
    }
    const attrs = this.selected?.getAttributes() as Record<string, string> | undefined;
    if (tag === 'a' || tag === 'button') {
      const label = document.createElement('label');
      label.className = 'field dynamic-field';
      label.textContent = 'Link';
      const input = document.createElement('input');
      input.value = attrs?.href ?? '';
      input.placeholder = 'https://example.com or #section';
      input.addEventListener(
        'input',
        () =>
          this.selected && this.adapter.updateComponentTraits(this.selected, { href: input.value }),
      );
      label.append(input);
      host.append(label);
    }
    if (tag === 'img') {
      const label = document.createElement('label');
      label.className = 'field dynamic-field';
      label.textContent = 'Alt text';
      const input = document.createElement('input');
      input.value = attrs?.alt ?? '';
      input.addEventListener(
        'input',
        () =>
          this.selected && this.adapter.updateComponentTraits(this.selected, { alt: input.value }),
      );
      label.append(input);
      host.append(label);
    }
    this.renderStyleGroup(host, 'Typography', [
      'font-family',
      'font-size',
      'font-weight',
      'line-height',
      'letter-spacing',
      'text-align',
    ]);
    this.renderStyleGroup(host, 'Layout', [
      'width',
      'max-width',
      'min-height',
      'margin',
      'padding',
      'display',
      'gap',
      'justify-content',
      'align-items',
    ]);
    this.renderStyleGroup(host, 'Appearance', [
      'background-color',
      'border',
      'border-radius',
      'box-shadow',
      'opacity',
    ]);
  }

  private renderStyleGroup(host: HTMLElement, title: string, properties: string[]): void {
    if (!this.selected) return;
    const details = document.createElement('details');
    details.open = title === 'Typography';
    const summary = document.createElement('summary');
    summary.textContent = title;
    details.append(summary);
    const styles = this.selected.getStyle() as Record<string, string>;
    properties.forEach((property) => {
      const label = document.createElement('label');
      label.className = 'field dynamic-field';
      label.textContent = property;
      const input = document.createElement('input');
      input.value = styles[property] ?? '';
      input.placeholder = 'Inherited';
      input.addEventListener(
        'input',
        () =>
          this.selected && this.adapter.updateStyles(this.selected, { [property]: input.value }),
      );
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'mini-btn';
      reset.textContent = 'Reset';
      reset.addEventListener('click', () => {
        if (!this.selected) return;
        this.selected.setStyle({ [property]: '' });
        input.value = '';
      });
      label.append(input, reset);
      details.append(label);
    });
    host.append(details);
  }

  private renderAdvancedControls(host: HTMLElement): void {
    const attrs = this.selected?.getAttributes() as Record<string, string> | undefined;
    [
      ['Element name', 'name'],
      ['HTML ID', 'id'],
      ['CSS classes', 'class'],
    ].forEach(([labelText, key]) => {
      const label = document.createElement('label');
      label.className = 'field dynamic-field';
      label.textContent = labelText;
      const input = document.createElement('input');
      input.value = attrs?.[key] ?? String(this.selected?.get('name') ?? '');
      input.addEventListener('input', () => {
        if (!this.selected) return;
        if (key === 'name') this.selected.set('name', input.value);
        else this.adapter.updateComponentTraits(this.selected, { [key]: input.value });
      });
      label.append(input);
      host.append(label);
    });
    const actions = document.createElement('div');
    actions.className = 'dynamic-actions';
    const duplicate = document.createElement('button');
    duplicate.textContent = 'Duplicate';
    duplicate.onclick = () => this.duplicateSelected();
    const remove = document.createElement('button');
    remove.textContent = 'Delete';
    remove.onclick = () => this.deleteSelected();
    actions.append(duplicate, remove);
    host.append(actions);
    const lock = document.createElement('button');
    lock.className = 'mini-btn';
    lock.textContent = this.isLocked(this.selected) ? 'Unlock element' : 'Lock element';
    lock.onclick = () => {
      this.selected?.set('locked', !this.isLocked(this.selected));
      this.renderLayers();
      this.renderDynamicInspector('advanced');
    };
    host.append(lock);
  }

  private renderLayers(): void {
    const list = document.querySelector<HTMLElement>('#layerList');
    const root = this.adapter.getRoot();
    if (!list || !root) return;
    list.replaceChildren(...this.layerNodes(root.components().models));
  }

  private layerNodes(components: Component[]): HTMLElement[] {
    return components.flatMap((component) => {
      const row = document.createElement('div');
      row.className = `layer-row ${component === this.selected ? 'active' : ''} ${this.isLocked(component) ? 'locked' : ''}`;
      row.dataset.componentId = component.getId();
      row.tabIndex = 0;
      row.draggable = true;
      row.setAttribute('role', 'treeitem');
      const hasChildren = component.components().length > 0;
      row.innerHTML = `<button class="layer-toggle" data-layer-toggle aria-label="${hasChildren ? 'Expand or collapse' : 'No children'}">${hasChildren ? (this.expandedLayerIds.has(component.getId()) ? '▾' : '▸') : '·'}</button><span class="layer-icon">${this.isContainer(component) ? '▦' : '◦'}</span><strong>${componentLabel(component)}</strong><span class="layer-actions"><button data-layer-action="up" aria-label="Move up">↑</button><button data-layer-action="down" aria-label="Move down">↓</button><button data-layer-action="hide" aria-label="Hide or show">${component.get('visible') === false ? '◌' : '◉'}</button><button data-layer-action="lock" aria-label="Lock or unlock">${this.isLocked(component) ? '🔒' : '⌑'}</button><button data-layer-action="duplicate" aria-label="Duplicate">＋</button><button data-layer-action="delete" aria-label="Delete">×</button></span>`;
      row.querySelector('strong')?.addEventListener('dblclick', () => {
        const next = window.prompt('Rename layer', componentLabel(component));
        if (next?.trim()) {
          component.set('name', next.trim());
          this.renderLayers();
          this.scheduleSave();
        }
      });
      const children = component.components().models;
      if (!children.length || !this.expandedLayerIds.has(component.getId())) return [row];
      const group = document.createElement('div');
      group.className = 'layer-children';
      group.append(...this.layerNodes(children));
      return [row, group];
    });
  }

  private toggleLayer(id: string): void {
    if (this.expandedLayerIds.has(id)) this.expandedLayerIds.delete(id);
    else this.expandedLayerIds.add(id);
    this.renderLayers();
  }

  private isLocked(component: Component | null): boolean {
    return Boolean(component?.get('locked'));
  }

  private isProtected(component: Component): boolean {
    return (
      component === this.adapter.getRoot() ||
      String(component.get('tagName')) === 'body' ||
      this.isLocked(component)
    );
  }

  private canDrop(dragged: Component, target: Component): boolean {
    return (
      dragged !== target &&
      !dragged.isChildOf(target) &&
      this.isContainer(target) &&
      !this.isProtected(dragged) &&
      !this.isLocked(target)
    );
  }

  private layerAction(action: string, component: Component): void {
    if (action === 'hide') component.set('visible', component.get('visible') === false);
    if (action === 'lock') component.set('locked', !this.isLocked(component));
    if (action === 'duplicate' && !this.isProtected(component)) {
      this.adapter.selectComponent(component);
      this.duplicateSelected();
    }
    if (action === 'delete' && !this.isProtected(component)) {
      this.adapter.selectComponent(component);
      this.deleteSelected();
    }
    if (action === 'up' || action === 'down') this.moveLayer(component, action === 'up' ? -1 : 1);
    this.renderLayers();
    this.scheduleSave();
  }

  private moveLayer(component: Component, delta: number): void {
    if (this.isProtected(component)) return;
    const parent = component.parent();
    if (!parent) return;
    const siblings = parent.components().models;
    const index = siblings.indexOf(component);
    const next = index + delta;
    if (next < 0 || next >= siblings.length) return;
    component.move(parent, { at: next });
  }

  private findById(
    id: string,
    components = this.adapter.getRoot()?.components().models ?? [],
  ): Component | null {
    for (const component of components) {
      if (component.getId() === id) return component;
      const found = this.findById(id, component.components().models);
      if (found) return found;
    }
    return null;
  }

  private updateColor(property: string, value: string, labelSelector: string): void {
    if (!this.selected) return;
    this.adapter.updateStyles(this.selected, { [property]: value });
    document
      .querySelector(labelSelector)
      ?.replaceChildren(document.createTextNode(value.toUpperCase()));
  }

  private duplicateSelected(): void {
    const copy = firstComponent(this.adapter.duplicateComponent(this.selected ?? undefined));
    if (copy) this.adapter.selectComponent(copy);
  }

  private deleteSelected(): void {
    if (!this.selected || this.selected.get('tagName') === 'body') return;
    this.adapter.deleteComponent(this.selected);
    this.selected = null;
    this.renderLayers();
  }

  private setDevice(device: DeviceId): void {
    if (!['desktop', 'tablet', 'mobile'].includes(device)) return;
    this.device = device;
    this.adapter.setDevice(device);
    document
      .querySelectorAll('.device')
      .forEach((button) =>
        button.classList.toggle('active', button.getAttribute('data-width') === device),
      );
    const frame = document.querySelector<HTMLElement>('.gjs-frame');
    if (frame) frame.style.maxWidth = `${deviceWidths[device]}px`;
    this.setCanvasStatus(device);
  }

  private setCanvasStatus(device: DeviceId): void {
    document
      .querySelector('#canvasSizeStatus')
      ?.replaceChildren(document.createTextNode(`Canvas ${deviceWidths[device]} px`));
  }

  private changeZoom(delta: number): void {
    const current = Number.parseInt(document.querySelector('#zoomValue')?.textContent ?? '90', 10);
    const next = Math.max(50, Math.min(120, current + delta));
    document.querySelector('#zoomValue')?.replaceChildren(document.createTextNode(`${next}%`));
    this.adapter.setZoom(next);
  }

  private togglePreview(): void {
    this.previewing = !this.previewing;
    this.adapter.setPreview(this.previewing);
    document.querySelector('.editor-shell')?.classList.toggle('preview-mode', this.previewing);
    document.querySelector('.left-rail')?.classList.toggle('preview-hidden', this.previewing);
    document.querySelector('.inspector')?.classList.toggle('preview-hidden', this.previewing);
    const button = document.querySelector('#previewBtn');
    if (button) button.textContent = this.previewing ? 'Exit preview' : 'Preview';
  }

  private switchPage(pageId: string): void {
    const current = this.project.pages.find((page) => page.id === this.project.currentPageId);
    if (current) {
      current.projectData = this.adapter.exportProjectData();
      current.updatedAt = new Date().toISOString();
    }
    let destination = this.project.pages.find((page) => page.id === pageId);
    if (!destination) {
      destination = {
        id: pageId,
        name: pageId,
        slug: uniqueSlug(this.project, pageId),
        projectData: null,
        updatedAt: new Date().toISOString(),
      };
      this.project.pages.push(destination);
    }
    this.project.currentPageId = destination.id;
    if (destination.projectData) this.adapter.loadProjectData(destination.projectData);
    else this.adapter.loadProjectData({ components: '<div class="site-canvas desktop"></div>' });
    document
      .querySelector('.crumb span')
      ?.replaceChildren(document.createTextNode(destination.name));
    this.renderPages();
    this.saveNow('Page switch');
  }

  private createPage(): void {
    const page = newPage(this.project, `New page ${this.project.pages.length + 1}`);
    this.project.pages.push(page);
    this.renderPages();
    this.switchPage(page.id);
  }

  private renderPages(): void {
    const panel = document.querySelector('#pagesPanel');
    const tree = document.querySelector('#siteTree');
    if (!panel || !tree) return;
    panel.querySelectorAll('.page-row, .deleted-page-row').forEach((row) => row.remove());
    [...this.project.pages].reverse().forEach((page) => {
      const row = document.createElement('div');
      row.className = `page-row ${page.id === this.project.currentPageId ? 'active' : ''}`;
      row.innerHTML = `<button data-page-action="open" data-page-id="${page.id}" class="page-open"><span>▧</span><strong>${page.name}</strong><small>${page.isHomepage ? 'Home · ' : ''}${page.slug}</small></button><span class="page-actions"><button data-page-action="home" data-page-id="${page.id}" aria-label="Set homepage">⌂</button><button data-page-action="up" data-page-id="${page.id}">↑</button><button data-page-action="down" data-page-id="${page.id}">↓</button><button data-page-action="duplicate" data-page-id="${page.id}">＋</button><button data-page-action="delete" data-page-id="${page.id}">×</button></span>`;
      tree.before(row);
    });
    this.project.deletedPages.forEach((page) => {
      const row = document.createElement('div');
      row.className = 'deleted-page-row';
      row.innerHTML = `<span>↺ ${page.name}</span><button data-page-action="restore" data-page-id="${page.id}">Restore</button>`;
      tree.before(row);
    });
  }

  private deletePage(pageId: string): void {
    if (this.project.pages.length <= 1) {
      this.toast('Keep one page', 'The last page cannot be deleted.');
      return;
    }
    const page = this.project.pages.find((item) => item.id === pageId);
    if (!page || !window.confirm(`Move “${page.name}” to deleted pages?`)) return;
    const removed = removePage(this.project, pageId);
    if (!removed) return;
    this.renderPages();
    this.switchPage(this.project.currentPageId);
  }

  private reorderPage(pageId: string, delta: number): void {
    const index = this.project.pages.findIndex((page) => page.id === pageId);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= this.project.pages.length) return;
    [this.project.pages[index], this.project.pages[next]] = [
      this.project.pages[next],
      this.project.pages[index],
    ];
    this.renderPages();
    this.saveNow('Pages reordered');
  }

  private handleShortcut(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.openCommandPalette();
      return;
    }
    if (event.key === 'Escape' && !document.querySelector<HTMLElement>('#commandPalette')?.hidden) {
      this.closeCommandPalette();
      return;
    }
    const typing =
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '') ||
      document.activeElement?.getAttribute('contenteditable') === 'true';
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      this.saveNow('Manual save');
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      this.adapter.undo();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && !typing) {
      if (this.selected) {
        this.clipboard = this.selected.clone();
        this.toast('Copied element', 'Paste it anywhere in the layer tree.');
      }
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x' && !typing) {
      if (this.selected && !this.isProtected(this.selected)) {
        this.clipboard = this.selected.clone();
        this.deleteSelected();
      }
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v' && !typing) {
      event.preventDefault();
      this.pasteClipboard();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && !typing) {
      event.preventDefault();
      this.duplicateSelected();
    } else if (event.key === 'Delete' && !typing) {
      event.preventDefault();
      this.deleteSelected();
    }
  }

  private pasteClipboard(): void {
    if (!this.clipboard) return;
    const parent =
      this.selected && this.isContainer(this.selected)
        ? this.selected
        : (this.selected?.parent() ?? undefined);
    const copy = firstComponent(this.adapter.addComponent(this.clipboard.clone(), parent));
    if (copy) {
      this.stripDuplicateIds(copy);
      this.adapter.selectComponent(copy);
      this.scheduleSave();
    }
  }

  private stripDuplicateIds(component: Component): void {
    const attrs = component.getAttributes() as Record<string, string>;
    if (attrs.id)
      component.addAttributes({ id: `${attrs.id}-${Math.random().toString(36).slice(2, 7)}` });
    component.components().models.forEach((child) => this.stripDuplicateIds(child));
  }

  markDirty(label = 'Autosave'): void {
    this.scheduleSave(label);
  }

  private scheduleSave(label = 'Autosave'): void {
    const state = document.querySelector('#saveState');
    state?.replaceChildren(document.createTextNode('Saving… · WebKiln'));
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveNow(label), 450);
  }

  private saveNow(label: string): void {
    const page = this.project.pages.find((item) => item.id === this.project.currentPageId);
    if (page) {
      page.projectData = this.adapter.exportProjectData();
      page.updatedAt = new Date().toISOString();
    }
    if (label !== 'Autosave') {
      this.project.revisions.unshift({
        id: crypto.randomUUID(),
        label,
        createdAt: new Date().toISOString(),
        pageId: this.project.currentPageId,
        projectData: page?.projectData ?? null,
      });
      this.project.revisions = this.project.revisions.slice(0, 20);
    }
    this.storage.save(this.project);
    document
      .querySelector('#saveState')
      ?.replaceChildren(document.createTextNode('✓ Saved · WebKiln'));
    this.renderLayers();
  }

  private bindCustomCode(): void {
    const modal = document.querySelector<HTMLElement>('#codeModal');
    document.querySelector('#codeEditorBtn')?.addEventListener('click', () => {
      if (modal) modal.hidden = false;
    });
    document.querySelector('#closeCode')?.addEventListener('click', () => {
      if (modal) modal.hidden = true;
    });
    document.querySelector('#cancelCode')?.addEventListener('click', () => {
      if (modal) modal.hidden = true;
    });
    document.querySelector('#saveCode')?.addEventListener('click', () => {
      this.project.customCode.html =
        document.querySelector<HTMLTextAreaElement>('#codeInput')?.value ?? '';
      this.project.customCode.isolated = true;
      this.storage.save(this.project);
      if (modal) modal.hidden = true;
      this.toast('Sandbox code saved', 'Custom code remains isolated from the editor shell.');
    });
  }

  private bindRecovery(): void {
    const backup = this.storage.getLegacyBackup();
    if (!backup) return;
    const card = document.createElement('div');
    card.className = 'recovery-card';
    card.innerHTML = `<strong>Legacy backup available</strong><small>${backup.key} · ${backup.value.length.toLocaleString()} characters</small><div><button type="button" data-recover="restore">Restore</button><button type="button" data-recover="export">Export</button></div>`;
    card.addEventListener('click', (event) => {
      const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-recover]')
        ?.dataset.recover;
      if (
        action === 'restore' &&
        window.confirm(
          'Restore the saved legacy backup? Current pages remain available in local storage.',
        )
      ) {
        const restored = this.storage.restoreLatestLegacy();
        if (restored) {
          window.location.reload();
        }
      }
      if (action === 'export') {
        const blob = new Blob([backup.value], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `webkiln-${backup.key}-backup.json`;
        link.click();
        URL.revokeObjectURL(url);
      }
    });
    document.querySelector('#sitePanel')?.append(card);
  }

  private toast(title: string, detail: string): void {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.querySelector('strong')?.replaceChildren(document.createTextNode(title));
    toast.querySelector('small')?.replaceChildren(document.createTextNode(detail));
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 3000);
  }

  private toHex(value: string): string {
    if (value.startsWith('#')) return value;
    const match = value.match(/\d+/g);
    if (!match || match.length < 3) return '#0b0d0f';
    return `#${match
      .slice(0, 3)
      .map((part) => Number(part).toString(16).padStart(2, '0'))
      .join('')}`;
  }
}
