import type { WebKilnProject } from '../types';
import { createEmptyProject, migrateProject } from '../models/project-schema';

export interface ProjectStorage {
  load(): WebKilnProject;
  save(project: WebKilnProject): void;
  backupLegacy(key: string, value: string): void;
}

export class LocalProjectStorage implements ProjectStorage {
  constructor(private readonly key = 'webkiln-project-v2') {}

  load(): WebKilnProject {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return createEmptyProject();
      return migrateProject(JSON.parse(raw));
    } catch {
      return createEmptyProject();
    }
  }

  save(project: WebKilnProject): void {
    localStorage.setItem(this.key, JSON.stringify(project));
  }

  backupLegacy(key: string, value: string): void {
    localStorage.setItem(`${this.key}:legacy:${key}`, value);
  }
}
