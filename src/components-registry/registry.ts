export interface ComponentDefinition {
  id: string;
  version: number;
  category: 'layout' | 'content' | 'commerce' | 'forms' | 'media';
  displayName: string;
  defaultProps: Record<string, unknown>;
  editableFields: string[];
  allowedParents: string[];
  responsive: boolean;
}

export const componentRegistry: ComponentDefinition[] = [
  ['section', 'Section', 'layout'],
  ['container', 'Container', 'layout'],
  ['columns', 'Columns', 'layout'],
  ['grid', 'Grid', 'layout'],
  ['heading', 'Heading', 'content'],
  ['paragraph', 'Paragraph', 'content'],
  ['button', 'Button', 'content'],
  ['image', 'Image', 'media'],
  ['navigation', 'Navigation', 'content'],
  ['hero', 'Hero', 'content'],
  ['gallery', 'Gallery', 'media'],
  ['pricing', 'Pricing', 'commerce'],
  ['faq', 'FAQ', 'content'],
  ['contact', 'Contact', 'forms'],
  ['newsletter', 'Newsletter', 'forms'],
  ['form', 'Form', 'forms'],
].map(([id, displayName, category]) => ({
  id,
  displayName,
  category: category as ComponentDefinition['category'],
  version: 1,
  defaultProps: {},
  editableFields: ['content', 'style'],
  allowedParents: ['body', 'section', 'container'],
  responsive: true,
}));

export function getComponentDefinition(id: string): ComponentDefinition | undefined {
  return componentRegistry.find((item) => item.id === id);
}
