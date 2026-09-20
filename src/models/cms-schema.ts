import type { CmsFieldType } from '../cloud/contracts';

export const CMS_FIELD_TYPES: CmsFieldType[] = [
  'text',
  'rich-text',
  'number',
  'boolean',
  'date',
  'url',
  'image',
  'select',
  'multi-select',
  'reference',
  'slug',
];
export function sanitizeCmsRichText(value: string): string {
  return value
    .replace(/<((script|iframe|object|embed|style|form|link|meta))[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(script|iframe|object|embed|style|form|link|meta)[^>]*>/gi, '')
    .replace(/\s(on\w+|javascript:)\s*=\s*(['"]).*?\2/gi, '');
}
export function clampCmsPage(value: string | number | undefined, fallback = 1): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.min(10000, Math.floor(number))) : fallback;
}
export function clampCmsPageSize(value: string | number | undefined, fallback = 25): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.min(100, Math.floor(number))) : fallback;
}
