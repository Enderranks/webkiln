import grapesjs, { type Component, type Editor } from 'grapesjs';
import type { DeviceId, EditorAdapter, EditorEventName } from '../types';

const deviceMap: Record<DeviceId, string> = {
  desktop: 'Desktop',
  tablet: 'Tablet',
  mobile: 'Mobile',
};
const deviceWidths: Record<DeviceId, number> = { desktop: 1100, tablet: 760, mobile: 390 };

export class GrapesJSEditorAdapter implements EditorAdapter {
  private editor: Editor | null = null;
  private readonly listeners = new Map<EditorEventName, Set<(...args: unknown[]) => void>>();

  constructor(private readonly sourceContainer: HTMLElement) {}

  async initialize(): Promise<void> {
    if (this.editor) return;
    const initialHtml = this.sourceContainer.innerHTML;
    const styles = await this.collectStyles();
    this.sourceContainer.innerHTML = '';
    this.sourceContainer.classList.add('grapesjs-mounted');
    this.editor = grapesjs.init({
      container: this.sourceContainer,
      headless: false,
      fromElement: false,
      storageManager: false,
      selectorManager: { componentFirst: true },
      deviceManager: {
        devices: [
          { id: 'Desktop', name: 'Desktop', width: '1100px' },
          { id: 'Tablet', name: 'Tablet', width: '768px' },
          { id: 'Mobile', name: 'Mobile', width: '390px' },
        ],
      },
      canvas: { styles: [] },
      components: `<div class="site-canvas desktop">${initialHtml}</div>`,
      panels: { defaults: [] },
      blockManager: { blocks: [] },
    });
    this.editor.addStyle(styles);
    this.editor.on('load', () => {
      this.editor?.Canvas.getBody()?.classList.add('webkiln-canvas-body');
      this.injectFrameStyles(styles);
      this.emit('load');
    });
    this.injectFrameStyles(styles);
    this.editor.on('update', () => this.emit('update'));
    this.editor.on('component:selected', (component) => this.emit('select', component));
    this.editor.on('component:deselected', () => this.emit('select', null));
    this.editor.on('component:update', (component) => this.emit('update', component));
    this.editor.on('component:styleUpdate', (component) => this.emit('update', component));
    this.editor.on('component:add', (component) => this.emit('update', component));
    this.editor.on('component:remove', (component) => this.emit('update', component));
    this.editor.on('component:move', (component) => this.emit('update', component));
    this.setDevice('desktop');
  }

  private injectFrameStyles(styles: string): void {
    const frameDocument = this.editor?.Canvas.getDocument();
    if (!frameDocument) return;
    const style =
      frameDocument.head.querySelector<HTMLStyleElement>('[data-webkiln-styles]') ??
      frameDocument.createElement('style');
    style.dataset.webkilnStyles = 'true';
    style.textContent = `${styles}\nbody{margin:0;background:#0b0d0f!important;color:#f4f5f3!important}`;
    frameDocument.head.appendChild(style);
  }

  private async collectStyles(): Promise<string> {
    const linkedStyles = await Promise.all(
      Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map(
        async (link) => {
          try {
            return await fetch(link.href).then((response) => response.text());
          } catch {
            return '';
          }
        },
      ),
    );
    const inlineStyles = Array.from(document.styleSheets)
      .flatMap((sheet) => {
        try {
          return Array.from(sheet.cssRules).map((rule) => rule.cssText);
        } catch {
          return [];
        }
      })
      .join('\n');
    return `${linkedStyles.join('\n')}\n${inlineStyles}`;
  }

  private requireEditor(): Editor {
    if (!this.editor) throw new Error('GrapesJS adapter has not been initialized');
    return this.editor;
  }

  private emit(event: EditorEventName, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((callback) => callback(...args));
  }

  getEditor(): Editor {
    return this.requireEditor();
  }

  getRoot(): Component | null {
    return this.requireEditor().getWrapper() ?? null;
  }

  getChildren(component?: Component): Component[] {
    const target = component ?? this.getRoot();
    return target ? target.components().models : [];
  }

  loadProjectData(data: unknown): void {
    const editor = this.requireEditor();
    editor.loadProjectData(data as Parameters<Editor['loadProjectData']>[0]);
    this.ensureCanvasRoot();
  }

  private ensureCanvasRoot(): void {
    const root = this.requireEditor().getWrapper();
    if (!root) return;
    const first = root.components().models[0];
    const firstClass = String(
      (first?.getAttributes() as Record<string, unknown> | undefined)?.class ?? '',
    );
    if (firstClass.split(/\s+/).includes('site-canvas')) return;
    const wrapper = root.append({
      tagName: 'div',
      attributes: { class: 'site-canvas desktop' },
    })[0];
    if (!wrapper) return;
    root
      .components()
      .models.slice(0, -1)
      .forEach((component) => wrapper.append(component));
  }

  exportProjectData(): unknown {
    return this.requireEditor().getProjectData();
  }

  addComponent(component: unknown, target?: Component): unknown {
    const parent = target ?? this.getRoot();
    return parent?.append(component as Parameters<Component['append']>[0]);
  }

  selectComponent(component: unknown): void {
    this.requireEditor().select(component as Parameters<Editor['select']>[0]);
  }

  deleteComponent(component?: unknown): void {
    const selected = (component as Component | undefined) ?? this.requireEditor().getSelected();
    selected?.remove();
  }

  duplicateComponent(component?: unknown): unknown {
    const selected = (component as Component | undefined) ?? this.requireEditor().getSelected();
    return selected?.clone();
  }

  moveComponent(component: unknown, before?: unknown): void {
    const target = before as Component | undefined;
    if (target) (component as Component).move(target, { at: 0 });
  }

  setComponentVisible(component: unknown, visible: boolean): void {
    (component as Component).set('visible', visible);
  }

  updateComponentTraits(component: unknown, traits: Record<string, unknown>): void {
    (component as Component).addAttributes(traits);
  }

  updateStyles(component: unknown, styles: Record<string, string>): void {
    (component as Component).setStyle(styles);
  }

  undo(): void {
    this.requireEditor().UndoManager.undo();
  }

  redo(): void {
    this.requireEditor().UndoManager.redo();
  }

  setDevice(device: DeviceId): void {
    const editor = this.requireEditor();
    editor.setDevice(deviceMap[device]);
    this.getRoot()?.setClass(`site-canvas ${device}`);
    this.sourceContainer.classList.remove('desktop', 'tablet', 'mobile');
    this.sourceContainer.classList.add(device);
    this.sourceContainer.style.width = `${deviceWidths[device]}px`;
    this.emit('device', device);
  }

  getSelectedComponent(): Component | null {
    return this.requireEditor().getSelected() ?? null;
  }

  setZoom(value: number): void {
    this.requireEditor().Canvas.setZoom(value);
  }

  setPreview(enabled: boolean): void {
    const editor = this.requireEditor();
    if (enabled) editor.runCommand('core:preview');
    else editor.stopCommand('core:preview');
    window.setTimeout(() => {
      const body = editor.Canvas.getBody();
      body?.classList.toggle('webkiln-preview', enabled);
      editor.Canvas.getDocument()
        ?.querySelectorAll<HTMLElement>('.canvas-toolbar, .selection-tag')
        .forEach((item) => {
          item.style.display = enabled ? 'none' : '';
        });
    }, 0);
  }

  getFrameDocument(): Document | null {
    return this.requireEditor().Canvas.getDocument();
  }

  subscribe(event: EditorEventName, callback: (...args: unknown[]) => void): () => void {
    const callbacks = this.listeners.get(event) ?? new Set();
    callbacks.add(callback);
    this.listeners.set(event, callbacks);
    return () => callbacks.delete(callback);
  }

  destroy(): void {
    this.editor?.destroy();
    this.editor = null;
    this.sourceContainer.classList.remove('grapesjs-mounted');
    this.emit('destroy');
  }
}
