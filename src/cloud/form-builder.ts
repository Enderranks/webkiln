import type { FormField, FormFieldType } from './contracts';

export const FORM_FIELD_TYPES: FormFieldType[] = [
  'text',
  'email',
  'phone',
  'number',
  'date',
  'time',
  'select',
  'checkbox',
  'radio',
  'textarea',
  'consent',
  'hidden',
];

export function validateFormFields(fields: Array<Partial<FormField>>): string | null {
  if (!fields.length) return 'Add at least one form field.';
  const names = new Set<string>();
  for (const field of fields) {
    if (!field.id || !field.name || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(field.name))
      return 'Field names must start with a letter and use only letters, numbers, underscores, or hyphens.';
    if (names.has(field.name)) return `Field name "${field.name}" is used more than once.`;
    names.add(field.name);
    if (!field.label?.trim()) return `Field "${field.name}" needs a visible label.`;
    if (!field.type || !FORM_FIELD_TYPES.includes(field.type))
      return `Field "${field.name}" has an unsupported type.`;
    if (['select', 'radio'].includes(field.type) && !(field.options ?? []).length)
      return `Field "${field.name}" needs at least one option.`;
  }
  return null;
}
