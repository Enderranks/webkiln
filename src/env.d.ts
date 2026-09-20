import type { WebKilnEditorAdapter } from './editor';
import type { LocalProjectStorage } from './storage/project-storage';
import type { WebKilnProject } from './types';

declare global {
  interface ImportMetaEnv {
    readonly VITE_WEBKILN_API_URL?: string;
    readonly VITE_WEBKILN_CLOUD_MODE?: string;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
  interface Window {
    WebKiln?: {
      adapter?: WebKilnEditorAdapter;
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
