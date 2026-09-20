import type { WebKilnProject } from '../types';

export type AiSuggestionKind =
  'site-outline' | 'page-sections' | 'rewrite' | 'seo-description' | 'accessibility';

export interface AiProvider {
  readonly status: 'not-connected';
  suggest(kind: AiSuggestionKind, project: WebKilnProject): Promise<string>;
}

export const unavailableAiProvider: AiProvider = {
  status: 'not-connected',
  async suggest(kind, project) {
    return deterministicSuggestion(kind, project);
  },
};

export function deterministicSuggestion(kind: AiSuggestionKind, project: WebKilnProject): string {
  const title = project.site.title || 'your site';
  const pageNames = project.pages.filter((page) => !page.deletedAt).map((page) => page.name);
  if (kind === 'site-outline')
    return `Suggested outline for ${title}: ${pageNames.join(', ') || 'Home, About, Contact'}.`;
  if (kind === 'page-sections')
    return 'Suggested sections: clear introduction, proof or benefits, useful details, and one primary next step.';
  if (kind === 'rewrite')
    return 'Suggestion: make the first sentence specific about who this is for and the outcome it provides.';
  if (kind === 'seo-description')
    return `${title} — a clear place to learn what we do, why it matters, and how to take the next step.`;
  return 'Accessibility checklist: use one clear page heading, descriptive image alt text, visible focus styles, and readable contrast.';
}
