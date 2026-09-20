import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../src/models/project-schema';
import { deterministicSuggestion, unavailableAiProvider } from '../src/editor/ai-assist';

describe('AI provider boundary', () => {
  it('returns deterministic local suggestions without an external provider', async () => {
    const project = createEmptyProject();
    project.site.title = 'Northstar';
    expect(unavailableAiProvider.status).toBe('not-connected');
    expect(await unavailableAiProvider.suggest('seo-description', project)).toContain('Northstar');
    expect(deterministicSuggestion('accessibility', project)).toContain('alt text');
  });
});
