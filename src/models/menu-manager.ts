import type { MenuDefinition, MenuItem, MenuItemType, WebKilnProject } from '../types';
import { createDefaultEditorSettings } from './project-schema';

export function defaultMenus(project: WebKilnProject): MenuDefinition[] {
  return [
    {
      id: 'main',
      name: 'Main navigation',
      mobileMode: 'drawer',
      items: project.pages
        .filter((page) => !page.deletedAt && page.settings?.showInNavigation !== false)
        .map((page) => ({
          id: 'menu-' + page.id,
          label: page.name,
          type: 'page' as const,
          pageId: page.id,
        })),
    },
  ];
}

export function ensureMenus(project: WebKilnProject): MenuDefinition[] {
  const current = project.editorSettings?.menus;
  if (current?.length) return current;
  const menus = defaultMenus(project);
  project.editorSettings = {
    ...createDefaultEditorSettings(),
    ...(project.editorSettings ?? {}),
    menus,
  };
  return menus;
}

export function addMenuItem(
  menu: MenuDefinition,
  label: string,
  type: MenuItemType,
  target: string,
  pageId?: string,
): MenuItem {
  const item: MenuItem = {
    id: crypto.randomUUID(),
    label: label.trim(),
    type,
    target: target.trim(),
  };
  if (pageId) item.pageId = pageId;
  menu.items.push(item);
  return item;
}

export function removeMenuItem(menu: MenuDefinition, itemId: string): boolean {
  const remove = (items: MenuItem[]): boolean => {
    const index = items.findIndex((item) => item.id === itemId);
    if (index >= 0) {
      items.splice(index, 1);
      return true;
    }
    return items.some((item) => remove(item.children ?? []));
  };
  return remove(menu.items);
}

export function moveMenuItem(menu: MenuDefinition, itemId: string, delta: -1 | 1): boolean {
  const move = (items: MenuItem[]): boolean => {
    const index = items.findIndex((item) => item.id === itemId);
    if (index >= 0) {
      const target = index + delta;
      if (target < 0 || target >= items.length) return false;
      [items[index], items[target]] = [items[target], items[index]];
      return true;
    }
    return items.some((item) => move(item.children ?? []));
  };
  return move(menu.items);
}
