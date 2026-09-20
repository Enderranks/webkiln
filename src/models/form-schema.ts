import type { FormField } from '../cloud/contracts';

export const FORM_FIELD_TYPES = [
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
] as const;
export function validateFormData(
  fields: FormField[],
  data: Record<string, unknown>,
): string | null {
  for (const field of fields) {
    const value = data[field.name];
    if (field.required && (value === undefined || value === null || value === ''))
      return `${field.name} is required`;
    if (value === undefined || value === null || value === '') continue;
    if (
      field.type === 'email' &&
      (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    )
      return `${field.name} must be a valid email`;
    if (field.type === 'consent' && value !== true && value !== 'true')
      return `${field.name} must be accepted`;
    if (['select', 'radio'].includes(field.type) && !field.options?.includes(String(value)))
      return `${field.name} has an invalid option`;
  }
  return null;
}
export function isHoneypotSpam(data: Record<string, unknown>): boolean {
  return Boolean(data._website || data.website_url);
}
export function automationKey(trigger: string, eventId: string): string {
  return `${trigger}:${eventId}`;
}
