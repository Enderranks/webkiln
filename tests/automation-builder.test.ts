import { describe, expect, it } from 'vitest';
import { AUTOMATION_TRIGGERS, validateAutomationGraph } from '../src/cloud/automation-builder';

describe('visual automation builder validation', () => {
  it('requires valid condition and action nodes', () => {
    expect(
      validateAutomationGraph({ conditions: [], actions: [{ type: 'log-event', config: {} }] }),
    ).toBeNull();
    expect(
      validateAutomationGraph({ conditions: [{ field: '', operator: 'equals' }], actions: [] }),
    ).toContain('condition');
    expect(
      validateAutomationGraph({
        conditions: [],
        actions: Array.from({ length: 11 }, () => ({ type: 'log-event', config: {} })),
      }),
    ).toContain('limited');
  });

  it('keeps the revision trigger in the shared visual trigger contract', () => {
    expect(AUTOMATION_TRIGGERS).toContain('revision.created');
  });
});
