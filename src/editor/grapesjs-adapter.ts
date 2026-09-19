import grapesjs, { type Editor } from 'grapesjs';
import type { DeviceId, EditorAdapter, EditorEventName } from '../types';

const deviceMap: Record<DeviceId, string> = {
  desktop: 'Desktop',
  tablet: 'Tablet',
  mobile: 'Mobile',
};

export class GrapesJSEditorAdapter implements EditorAdapter {
  private editor: Editor | null = null;
  private readonly listeners = new Map<EditorEventName, Set<(...args: unknown[]) => void>>();

  constructor(private readonly sourceContainer: HTMLElement) {}

  async initialize(): Promise<void> {
    const initialHtml = this.sourceContainer.innerHTML;
    const engineHost = document.createElement('div');
    engineHost.id = 'grapesjs-engine-host';
    engineHost.setAttribute('aria-hidden', 'true');
    engineHost.style.display = 'none';
    document.body.appendChild(engineHost);
    this.editor = grapesjs.init({
      container: engineHost,
      headless: true,
      fromElement: false,
      storageManager: false,
      selectorManager: { componentFirst: true },
      deviceManager: {
        devices: [
          { id: 'Desktop', name: 'Desktop', width: '' },
          { id: 'Tablet', name: 'Tablet', width: '768px' },
          { id: 'Mobile', name: 'Mobile', width: '390px' },
        ],
      },
      components: initialHtml,
      panels: { defaults: [] },
      blockManager: { blocks: [] },
    });
    this.editor.on('load', () => this.emit('load'));
    this.editor.on('update', () => this.emit('update'));
    this.editor.on('component:selected', (component) => this.emit('select', component));
    this.emit('load');
  }

  private requireEditor(): Editor {
    if (!this.editor) throw new Error('GrapesJS adapter has not been initialized');
    return this.editor;
  }
  private emit(event: EditorEventName, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((callback) => callback(...args));
  }

  loadProjectData(data: unknown): void {
    this.requireEditor().loadProjectData(data as Parameters<Editor['loadProjectData']>[0]);
  }
  exportProjectData(): unknown {
    return this.requireEditor().getProjectData();
  }
  addComponent(component: unknown): unknown {
    return this.requireEditor().addComponents(component as Parameters<Editor['addComponents']>[0]);
  }
  selectComponent(component: unknown): void {
    this.requireEditor().select(component as Parameters<Editor['select']>[0]);
  }
  deleteComponent(component?: unknown): void {
    (
      (component as { remove?: () => void } | undefined) ??
      (this.requireEditor().getSelected() as { remove?: () => void } | undefined)
    )?.remove?.();
  }
  duplicateComponent(component?: unknown): unknown {
    return (
      (component as { clone?: () => unknown } | undefined) ??
      (this.requireEditor().getSelected() as { clone?: () => unknown } | undefined)
    )?.clone?.();
  }
  moveComponent(component: unknown, before?: unknown): void {
    (component as { move?: (target: unknown, opts?: unknown) => void })?.move?.(before, { at: 0 });
  }
  setComponentVisible(component: unknown, visible: boolean): void {
    (component as { set?: (key: string, value: unknown) => void })?.set?.('visible', visible);
  }
  updateComponentTraits(component: unknown, traits: Record<string, unknown>): void {
    (component as { addAttributes?: (attrs: Record<string, unknown>) => void })?.addAttributes?.(
      traits,
    );
  }
  updateStyles(component: unknown, styles: Record<string, string>): void {
    (component as { setStyle?: (style: Record<string, string>) => void })?.setStyle?.(styles);
  }
  undo(): void {
    this.requireEditor().UndoManager.undo();
  }
  redo(): void {
    this.requireEditor().UndoManager.redo();
  }
  setDevice(device: DeviceId): void {
    this.requireEditor().setDevice(deviceMap[device]);
    this.emit('device', device);
  }
  getSelectedComponent(): unknown {
    return this.requireEditor().getSelected();
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
    document.querySelector('#grapesjs-engine-host')?.remove();
    this.emit('destroy');
  }
}
