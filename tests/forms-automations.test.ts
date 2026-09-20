import { describe, expect, it } from 'vitest';
import {
  automationKey,
  FORM_FIELD_TYPES,
  isHoneypotSpam,
  validateFormData,
} from '../src/models/form-schema';

describe('v17 forms and automations', () => {
  it('validates accessible typed fields and honeypot spam', () => {
    expect(FORM_FIELD_TYPES).toContain('consent');
    expect(
      validateFormData(
        [{ id: 'email', name: 'email', type: 'email', label: 'Email', required: true }],
        { email: 'bad' },
      ),
    ).toContain('valid email');
    expect(isHoneypotSpam({ _website: 'bot' })).toBe(true);
  });
  it('creates deterministic idempotency keys', () => {
    expect(automationKey('form.submitted', 'event-1')).toBe('form.submitted:event-1');
  });
});
