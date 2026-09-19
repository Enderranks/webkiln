import type { GrapesJSEditorAdapter } from './editor';
import type { LocalProjectStorage } from './storage/project-storage';
import type { WebKilnProject } from './types';

declare global {
  interface Window {
    WebKiln?: {
      adapter?: GrapesJSEditorAdapter;
      project?: WebKilnProject;
      storage?: LocalProjectStorage;
      recoverLegacy?: () => WebKilnProject | null;
      [key: string]: unknown;
    };
    select?: (element: Element | null) => void;
    snapshot?: () => void;
    restore?: (index: number) => void;
    setSaved?: (done: boolean) => void;
    addBlock?: (type: string) => void;
    wireSections?: () => void;
    toastMessage?: (title: string, detail: string) => void;
  }
}

export {};
