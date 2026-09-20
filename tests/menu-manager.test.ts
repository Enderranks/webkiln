import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../src/models/project-schema';
import {
  addMenuItem,
  ensureMenus,
  findMenuItem,
  moveMenuItem,
  removeMenuItem,
} from '../src/models/menu-manager';

describe('menu manager', () => {
  it('creates a main menu from visible pages and supports safe edits', () => {
    const project = createEmptyProject();
    project.pages = [
      {
        ...project.pages[0],
        name: 'Home',
        settings: { showInNavigation: true, passwordProtected: false },
      },
    ];
    const menu = ensureMenus(project)[0];
    const item = addMenuItem(menu, 'Docs', 'external', 'https://docs.example.test');
    expect(menu.items).toHaveLength(2);
    expect(moveMenuItem(menu, item.id, -1)).toBe(true);
    expect(menu.items[0].label).toBe('Docs');
    expect(removeMenuItem(menu, item.id)).toBe(true);
    expect(menu.items).toHaveLength(1);
  });

  it('supports nested dropdown items without flattening the menu', () => {
    const project = createEmptyProject();
    project.pages = [{ ...project.pages[0], id: 'home', name: 'Home' }];
    const menu = ensureMenus(project)[0];
    const parent = addMenuItem(menu, 'Resources', 'dropdown', '');
    const child = addMenuItem(
      menu,
      'Docs',
      'external',
      'https://docs.example.test',
      undefined,
      parent.id,
    );
    expect(findMenuItem(menu, child.id)?.label).toBe('Docs');
    expect(parent.children).toHaveLength(1);
    expect(menu.items.find((item) => item.id === child.id)).toBeUndefined();
  });
});
