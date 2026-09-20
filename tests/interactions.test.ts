import { describe, expect, it } from 'vitest';
import { createEmptyProject, migrateProject } from '../src/models/project-schema';
import {
  createInteraction,
  normalizeInteractions,
  serializeInteractions,
  validateInteraction,
} from '../src/models/interaction-schema';

describe('visual interactions', () => {
  it('creates a safe typed interaction with timeline defaults', () => {
    const interaction = createInteraction('[data-wk-id="hero"]');
    expect(interaction.trigger).toBe('click');
    expect(interaction.actions[0].duration).toBe(300);
    expect(interaction.loop.enabled).toBe(false);
    expect(validateInteraction(interaction)).toBe(true);
  });

  it('normalizes bounds and rejects arbitrary action types', () => {
    const interaction = createInteraction('#hero');
    interaction.actions[0].duration = 50000;
    expect(normalizeInteractions([interaction])[0].actions[0].duration).toBe(10000);
    expect(
      validateInteraction({
        ...interaction,
        actions: [{ ...interaction.actions[0], type: 'run-js' }],
      }),
    ).toBe(false);
  });

  it('migrates v2 projects without losing existing data', () => {
    const project = createEmptyProject();
    const legacy = {
      ...project,
      schemaVersion: 2 as const,
      editorSettings: { ...project.editorSettings, interactions: undefined },
    };
    const migrated = migrateProject(legacy);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.pages).toEqual(project.pages);
    expect(migrated.editorSettings?.interactions).toEqual([]);
  });

  it('serializes only allowlisted interactions for published data', () => {
    const interaction = createInteraction('#hero');
    const serialized = serializeInteractions([
      interaction,
      { trigger: 'click', actions: [{ type: 'eval' }] },
    ]);
    expect(serialized).toContain('click');
    expect(serialized).not.toContain('eval');
    expect(serialized).not.toContain('javascript:');
  });
});
