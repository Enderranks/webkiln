import type { Component } from 'grapesjs';
import { getComponentDefinition } from '../components-registry/registry';
import type { DeviceId, PageDocument, WebKilnProject } from '../types';
import type { LocalProjectStorage } from '../storage/project-storage';
import { GrapesJSEditorAdapter } from './grapesjs-adapter';

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

const deviceWidths: Record<DeviceId, number> = { desktop: 1100, tablet: 760, mobile: 390 };

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

  constructor(
    private readonly adapter: GrapesJSEditorAdapter,
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
      .querySelectorAll<HTMLButtonElement>('.page-row')
      .forEach((row) =>
        row.addEventListener('click', () =>
          this.switchPage(row.querySelector('strong')?.textContent ?? 'Home'),
        ),
      );
    document
      .querySelector('#pagesPanel .mini-btn')
      ?.addEventListener('click', () => this.createPage());
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
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-component-id]');
      if (!row) return;
      const component = this.findById(row.dataset.componentId ?? '');
      if (component) this.adapter.selectComponent(component);
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
    if (tab === 'content') this.renderContentControls(host);
    if (tab === 'advanced') this.renderAdvancedControls(host);
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
      row.className = `layer-row ${component === this.selected ? 'active' : ''}`;
      row.dataset.componentId = component.getId();
      row.innerHTML = `<span class="layer-icon">${this.isContainer(component) ? '▦' : '◦'}</span><strong>${componentLabel(component)}</strong>`;
      const children = component.components().models;
      if (!children.length) return [row];
      const group = document.createElement('div');
      group.className = 'layer-children';
      group.append(...this.layerNodes(children));
      return [row, group];
    });
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

  private switchPage(name: string): void {
    const current = this.project.pages.find((page) => page.id === this.project.currentPageId);
    if (current) {
      current.projectData = this.adapter.exportProjectData();
      current.updatedAt = new Date().toISOString();
    }
    let destination = this.project.pages.find((page) => page.name === name);
    if (!destination) {
      destination = {
        id: name.toLowerCase().replace(/\s+/g, '-'),
        name,
        slug: `/${name.toLowerCase().replace(/\s+/g, '-')}`,
        projectData: null,
        updatedAt: new Date().toISOString(),
      };
      this.project.pages.push(destination);
    }
    this.project.currentPageId = destination.id;
    if (destination.projectData) this.adapter.loadProjectData(destination.projectData);
    else this.adapter.loadProjectData({ components: '<div class="site-canvas desktop"></div>' });
    document.querySelector('.crumb span')?.replaceChildren(document.createTextNode(name));
    document
      .querySelectorAll('.page-row')
      .forEach((row) => row.classList.toggle('active', row.textContent?.includes(name) ?? false));
    this.saveNow('Page switch');
  }

  private createPage(): void {
    const number = this.project.pages.length + 1;
    const name = `New page ${number}`;
    const page: PageDocument = {
      id: `page-${Date.now()}`,
      name,
      slug: `/page-${number}`,
      projectData: null,
      updatedAt: new Date().toISOString(),
    };
    this.project.pages.push(page);
    const row = document.createElement('button');
    row.className = 'page-row';
    row.type = 'button';
    row.innerHTML = `<span>▧</span><strong>${name}</strong><small>•••</small>`;
    row.onclick = () => this.switchPage(name);
    document.querySelector('#siteTree')?.before(row);
    this.switchPage(name);
  }

  private handleShortcut(event: KeyboardEvent): void {
    const typing =
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '') ||
      document.activeElement?.getAttribute('contenteditable') === 'true';
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      this.saveNow('Manual save');
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      this.adapter.undo();
    } else if (event.key === 'Delete' && !typing) {
      event.preventDefault();
      this.deleteSelected();
    }
  }

  private scheduleSave(): void {
    const state = document.querySelector('#saveState');
    state?.replaceChildren(document.createTextNode('Saving… · GrapesJS'));
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveNow('Autosave'), 450);
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
      ?.replaceChildren(document.createTextNode('✓ Saved · GrapesJS'));
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
