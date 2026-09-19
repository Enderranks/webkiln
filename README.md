# WebKiln editor

WebKiln is a browser-based website editor with a custom editor shell and a typed GrapesJS model adapter.

## Development

```text
npm install
npm run dev
```

The production commands are:

```text
npm run type-check
npm run lint
npm test
npm run build
npm run preview
```

The build writes the deployable static site to `dist/` and preserves `.openai/hosting.json` for Sites hosting.

## Architecture

- `src/main.ts` bootstraps the editor and keeps the existing shell behavior intact.
- `src/editor/grapesjs-adapter.ts` owns the real GrapesJS dependency behind the `EditorAdapter` interface.
- `src/models/project-schema.ts` and `src/storage/project-storage.ts` provide versioned project persistence with legacy local-storage backup.
- `src/components-registry/registry.ts` is the typed component-definition registry used by editor integrations.
- `src/legacy/` contains the original version-6 interaction bridge while the visible canvas migration is staged.
- `src/styles/` contains the existing layered visual styles, copied into the source tree so Vite owns the asset graph.

## Migration status

The Vite/TypeScript foundation, structured project model, real GrapesJS adapter, visible GrapesJS canvas, WebKiln block bridge, nested selection, inspector controls, layers tree, page switching, responsive devices, preview mode, autosave, and recovery path are in place. The old version-6 scripts remain in `src/legacy/` only as rollback/reference material and are not imported by the active runtime.

The following are intentionally out of scope for this phase: authentication, billing, ecommerce, collaboration, a hosted backend, and a production custom-code execution service. Custom code remains isolated in project data and is not evaluated by the editor.

The generated `dist/` folder is deployment output; edit `src/` and rebuild rather than editing generated files directly.
