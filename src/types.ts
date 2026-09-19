export type DeviceId = 'desktop' | 'laptop' | 'tablet' | 'mobile';
export type EditingMode = 'guided' | 'standard' | 'pro';
export type ResponsiveIntentKind =
  | 'keep-beside'
  | 'stack-below'
  | 'full-width-small'
  | 'hide-at-breakpoint'
  | 'reorder-mobile'
  | 'maintain-aspect'
  | 'prioritize-content'
  | 'mobile-navigation'
  | 'horizontal-scroll'
  | 'accordion'
  | 'responsive-type'
  | 'preserve-custom';
export interface ResponsiveBreakpoint {
  id: string;
  label: string;
  width: number;
  inheritedFrom?: string;
}
export interface ResponsiveIntent {
  kind: ResponsiveIntentKind;
  enabled: boolean;
  breakpoint?: string;
  order?: number;
  value?: string;
  source: EditingMode;
}
export interface ResponsiveComponentMetadata {
  intents: ResponsiveIntent[];
  overrides?: Record<string, boolean>;
}
export interface EditorSettings {
  mode: EditingMode;
  breakpoints: ResponsiveBreakpoint[];
  responsiveIntents: Record<string, ResponsiveComponentMetadata>;
  designSystem?: DesignSystem;
}

export interface DesignToken {
  name: string;
  value: string;
  category: string;
  description?: string;
}
export interface DesignSystem {
  tokens: DesignToken[];
  componentVariants: Record<string, Array<{ name: string; styles: Record<string, string> }>>;
  linkedComponents: Record<string, string[]>;
  globalRegions: { navigation?: string; footer?: string; announcement?: string };
}

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
  isHomepage?: boolean;
  seo?: { title: string; description: string; canonical?: string };
  settings?: { showInNavigation: boolean; passwordProtected: boolean };
  deletedAt?: string;
}

export interface WebKilnProject {
  schemaVersion: 2;
  site: SiteMetadata;
  pages: PageDocument[];
  deletedPages: PageDocument[];
  homepagePageId: string;
  currentPageId: string;
  themeTokens: Record<string, string>;
  editorSettings?: EditorSettings;
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
