import type { WebKilnProject } from '../types';
import { migrateProject } from '../models/project-schema';

const MAX_PROJECT_BYTES = 8 * 1024 * 1024;

export function validateProjectPayload(value: unknown): WebKilnProject {
  const encoded = JSON.stringify(value);
  if (!encoded || encoded.length > MAX_PROJECT_BYTES)
    throw new Error('VALIDATION_ERROR: project payload is too large');
  const project = migrateProject(value);
  if (!project.site || !Array.isArray(project.pages) || !Array.isArray(project.revisions)) {
    throw new Error('VALIDATION_ERROR: malformed project');
  }
  return project;
}

export function assertSafeRedirect(value: string, fallback = '/'): string {
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin
      ? `${url.pathname}${url.search}${url.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}

export function projectSummary(project: WebKilnProject): {
  pageCount: number;
  revisionCount: number;
  assetCount: number;
} {
  return {
    pageCount: project.pages.length,
    revisionCount: project.revisions.length,
    assetCount: project.assets.length,
  };
}
