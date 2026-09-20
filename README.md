# WebKiln editor

WebKiln is a browser-based website editor with a custom editor shell and a typed WebKiln editor adapter.

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

### v10 SaaS foundation

The current private Sites deployment/version 10 remains static-only. The repository now also contains a separate Cloudflare Worker v11 testing surface: Hono API routes, D1/Drizzle persistence, Better Auth cookie sessions, and Worker-hosted static assets with SPA fallback. The frontend keeps local persistence as its safe default and can use the combined Worker with `VITE_WEBKILN_CLOUD_MODE=true` and relative `/api` requests.

The cloud boundary includes typed auth/project/revision contracts, a credentials-included API client, a cloud project adapter, payload validation and size limits, optimistic-revision autosave queueing, offline/conflict states, safe redirect validation, and local-project import previews with migration backups. The Worker implements HTTP-only cookie sessions, D1-backed relational persistence, membership/role enforcement, revision conflict checks, explicit CORS/trusted origins, and the documented `/api` contract. Remote deployment still requires the account owner to authenticate Wrangler and supply the exact development D1 ID.

The cloud UI is available at `/login`, `/signup`, `/dashboard`, and `/editor/:siteId`. Dashboard workspace/site creation, local-project import confirmation, account navigation, cloud revision history, same-origin autosave, local recovery copies, and revision-conflict reload handling are implemented on top of the existing editor shell.

- `src/main.ts` bootstraps the editor and keeps the existing shell behavior intact.
- `src/editor/webkiln-editor-adapter.ts` owns the internal canvas engine behind the `EditorAdapter` interface. The dependency is an implementation detail and is not part of the WebKiln user experience or published sites.
- `src/models/project-schema.ts` and `src/storage/project-storage.ts` provide versioned project persistence with legacy local-storage backup.
- `src/components-registry/registry.ts` is the typed component-definition registry used by editor integrations.
- `src/legacy/` contains the original version-6 interaction bridge while the visible canvas migration is staged.
- `src/styles/` contains the existing layered visual styles, copied into the source tree so Vite owns the asset graph.

## Migration status

The Vite/TypeScript foundation, structured project model, WebKiln editor adapter, visible WebKiln canvas, block bridge, nested selection, inspector controls, layers tree, page switching, responsive devices, preview mode, autosave, and recovery path are in place. The old version-6 scripts remain in `src/legacy/` only as rollback/reference material and are not imported by the active runtime.

Billing, ecommerce, collaboration, and a production custom-code execution service remain intentionally out of scope. Authentication and the hosted testing backend now exist behind the approved free-tier Cloudflare boundary. Custom code remains isolated in project data and is not evaluated by the editor.

The generated `dist/` folder is deployment output; edit `src/` and rebuild rather than editing generated files directly.
