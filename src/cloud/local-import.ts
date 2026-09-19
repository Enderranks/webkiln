import type { WebKilnProject } from '../types';
import { validateProjectPayload, projectSummary } from './validation';

export interface ImportPreview {
  project: WebKilnProject;
  summary: ReturnType<typeof projectSummary>;
  originalJson: string;
}

export function previewLocalProject(raw: string): ImportPreview {
  const value: unknown = JSON.parse(raw);
  const project = validateProjectPayload(value);
  return { project, summary: projectSummary(project), originalJson: raw };
}

export function createMigrationBackup(project: WebKilnProject): string {
  const backup = {
    exportedAt: new Date().toISOString(),
    source: 'webkiln-local-migration',
    project,
  };
  if (typeof localStorage !== 'undefined')
    localStorage.setItem(`webkiln-import-backup:${project.site.id}`, JSON.stringify(backup));
  return JSON.stringify(backup, null, 2);
}
