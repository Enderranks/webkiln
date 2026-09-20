# WebKiln v13 editing modes

WebKiln v13 keeps its internal visual editing runtime behind the existing adapter and adds a mode-aware experience around it.

- **Guided** exposes plain-language recommendations, a content checklist, safe responsive actions, and hides advanced controls visually.
- **Standard** is the default visual editor with layers, inspector, devices, components, and global styles.
- **Pro** exposes the existing advanced inspector surface and responsive metadata controls. Custom code remains sandboxed by the existing project contract.

Modes are stored in `project.editorSettings.mode` and switching modes never rewrites page or component data.

Responsive behavior is represented as typed `ResponsiveIntent` metadata per component. The engine translates metadata into scoped `.wk-intent-*` rules at Desktop, Laptop, Tablet, or Mobile breakpoints. Changes use the editor adapter's undo/redo for component changes and WebKiln autosave for project settings. Breakpoint values inherit until an explicit override is added; reset removes that override.

The v13 migration adds the D1 `site.editor_settings` column. Existing sites receive standard mode and the four default breakpoints automatically. No public HTML includes editor settings.
