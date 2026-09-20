import { describe, expect, it } from 'vitest';
import { validateFormFields } from '../src/cloud/form-builder';

describe('visual form builder validation', () => {
  const base = {
    id: 'field-1',
    name: 'email',
    type: 'email' as const,
    label: 'Email',
    required: true,
  };

  it('accepts accessible unique fields', () => {
    expect(validateFormFields([base])).toBeNull();
  });

  it('rejects duplicate names and optionless choice fields', () => {
    expect(validateFormFields([base, { ...base, id: 'field-2' }])).toContain('used more than once');
    expect(validateFormFields([{ ...base, type: 'select' }])).toContain('at least one option');
  });

  it('validates multi-step conditional fields against known controls', () => {
    expect(
      validateFormFields([
        { ...base, name: 'kind' },
        {
          id: 'field-2',
          name: 'company',
          type: 'text',
          label: 'Company',
          required: true,
          step: 2,
          conditional: { field: 'kind', equals: 'business' },
        },
      ]),
    ).toBeNull();
    expect(
      validateFormFields([
        { ...base, name: 'kind' },
        {
          id: 'field-2',
          name: 'company',
          type: 'text',
          label: 'Company',
          required: true,
          step: 2,
          conditional: { field: 'missing', equals: 'business' },
        },
      ]),
    ).toContain('does not exist');
  });

  it('rejects malformed custom validation patterns', () => {
    expect(validateFormFields([{ ...base, validation: { pattern: '[' } }])).toContain(
      'validation pattern',
    );
  });
});
