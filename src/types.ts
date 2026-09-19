export type DeviceId = 'desktop' | 'tablet' | 'mobile';

export interface SiteMetadata {
  id: string;
  title: string;
  description: string;
  language: string;
  timezone: string;
}

export interface PageDocument {
  id: string;
  name: string;
  slug: string;
  projectData: unknown;
  updatedAt: string;
}

export interface WebKilnProject {
  schemaVersion: 1;
  site: SiteMetadata;
  pages: PageDocument[];
  currentPageId: string;
  themeTokens: Record<string, string>;
  assets: Array<{ id: string; name: string; mime: string; size: number }>;
  customCode: { html: string; css: string; javascript: string; isolated: true };
  revisions: Array<{
    id: string;
    label: string;
    createdAt: string;
    pageId: string;
    projectData: unknown;
  }>;
}

export type EditorEventName = 'load' | 'update' | 'select' | 'device' | 'destroy';

export interface EditorAdapter {
  initialize(): Promise<void>;
  loadProjectData(data: unknown): void;
  exportProjectData(): unknown;
  addComponent(component: unknown): unknown;
  selectComponent(component: unknown): void;
  deleteComponent(component?: unknown): void;
  duplicateComponent(component?: unknown): unknown;
  moveComponent(component: unknown, before?: unknown): void;
  setComponentVisible(component: unknown, visible: boolean): void;
  updateComponentTraits(component: unknown, traits: Record<string, unknown>): void;
  updateStyles(component: unknown, styles: Record<string, string>): void;
  undo(): void;
  redo(): void;
  setDevice(device: DeviceId): void;
  getSelectedComponent(): unknown;
  subscribe(event: EditorEventName, callback: (...args: unknown[]) => void): () => void;
  destroy(): void;
}
