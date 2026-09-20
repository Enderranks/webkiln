import type { ComponentDefinition } from '../components-registry/registry';

export const COMPONENT_SDK_VERSION = 1 as const;
export interface ComponentManifest {
  id: string;
  version: number;
  displayName: string;
  icon?: string;
  preview?: string;
  editableFields: Array<{
    name: string;
    type: 'text' | 'rich-text' | 'number' | 'color' | 'url' | 'image';
    required?: boolean;
  }>;
  traits: string[];
  allowedParents: string[];
  allowedChildren: string[];
  responsive: boolean;
  accessibility: { requiresLabel?: boolean; keyboard?: boolean; minTouchTarget?: number };
  inspector: Array<{ group: string; field: string; control: string }>;
  defaultStyles: Record<string, string>;
}
export interface ComponentPackage {
  sdkVersion: 1;
  manifest: ComponentManifest;
  markup: string;
  styles: string;
  migrations?: Record<string, { to: number }>;
}
export function componentDefinitionToManifest(definition: ComponentDefinition): ComponentManifest {
  const typeMap: Record<string, ComponentManifest['editableFields'][number]['type']> = {
    text: 'text',
    number: 'number',
    color: 'color',
    url: 'url',
    richtext: 'rich-text',
    image: 'image',
    select: 'text',
  };
  return {
    id: definition.id,
    version: definition.version,
    displayName: definition.displayName,
    icon: definition.icon,
    preview: definition.preview,
    editableFields: definition.inspectorSchema.map((field) => ({
      name: field.key,
      type: typeMap[field.type] ?? 'text',
    })),
    traits: definition.editableTraits,
    allowedParents: definition.allowedParents,
    allowedChildren: definition.allowedChildren,
    responsive: definition.responsive,
    accessibility: {
      requiresLabel: definition.accessibilityRequirements.some((item) => /label/i.test(item)),
      keyboard: definition.accessibilityRequirements.some((item) => /keyboard|focus/i.test(item)),
      minTouchTarget: 44,
    },
    inspector: definition.inspectorSchema.map((field) => ({
      group: 'WebKiln',
      field: field.key,
      control: field.type,
    })),
    defaultStyles: definition.defaultDesignTokens,
  };
}
const safeIdentifier = /^[a-z][a-z0-9-]{1,63}$/;
const unsafePackageContent =
  /<script\b|on[a-z]+\s*=|javascript\s*:|srcdoc\s*=|@import\b|expression\s*\(|behavior\s*:|-moz-binding\s*:|url\s*\(\s*["']?\s*javascript\s*:/i;
export function validateComponentPackage(value: unknown): value is ComponentPackage {
  if (!value || typeof value !== 'object') return false;
  const pkg = value as Partial<ComponentPackage>;
  const manifest = pkg.manifest;
  if (
    pkg.sdkVersion !== COMPONENT_SDK_VERSION ||
    typeof pkg.markup !== 'string' ||
    typeof pkg.styles !== 'string' ||
    !manifest ||
    !safeIdentifier.test(manifest.id ?? '')
  )
    return false;
  if (unsafePackageContent.test(`${pkg.markup}\n${pkg.styles}`)) return false;
  return (
    Array.isArray(manifest.editableFields) &&
    Array.isArray(manifest.traits) &&
    Array.isArray(manifest.allowedParents) &&
    Array.isArray(manifest.allowedChildren) &&
    typeof manifest.responsive === 'boolean' &&
    typeof manifest.defaultStyles === 'object'
  );
}
export function migrateComponentPackage(
  pkg: ComponentPackage,
  targetVersion: number,
): ComponentPackage {
  if (targetVersion < pkg.manifest.version) throw new Error('Cannot migrate backwards');
  return { ...pkg, manifest: { ...pkg.manifest, version: targetVersion } };
}
export function sanitizeComponentMarkup(markup: string): string {
  return markup
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\s(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)=("|')\s*javascript:[^"']*\2/gi, '');
}

export function sanitizeComponentStyles(styles: string): string {
  return styles
    .replace(/@import[\s\S]*?;/gi, '')
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/behavior\s*:[^;{}]+;?/gi, '')
    .replace(/-moz-binding\s*:[^;{}]+;?/gi, '')
    .replace(/url\s*\(\s*["']?\s*javascript:[^)]*\)/gi, '')
    .trim();
}
