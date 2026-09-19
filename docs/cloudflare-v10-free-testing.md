# WebKiln v10 Cloudflare free-testing setup

## Verified local stack

- Wrangler `4.135.0` is installed locally.
- Local Wrangler Worker runs at `http://127.0.0.1:8787`.
- Local D1 is simulated by Wrangler and does not consume remote Cloudflare allowances.
- Hono handles routing and CORS.
- Better Auth handles email/password authentication and cookie sessions.
- Drizzle ORM defines the application tables.
- `worker/migrations/0001_saas_foundation.sql` creates the Better Auth and WebKiln tables.
- R2 is intentionally not configured in v10.

Run locally:

```powershell
npm install
npm run d1:migrate:local
npx wrangler dev --config wrangler.jsonc --local --port 8787 --var BETTER_AUTH_SECRET:replace-with-a-local-only-32-character-secret
```

The frontend can be pointed at the local API with an uncommitted `.env.local` file:

```env
VITE_WEBKILN_API_URL=http://localhost:8787
```

## Remote free-tier development setup

Remote provisioning was not performed because Wrangler is not authenticated in the current environment. These commands are intentionally explicit and must be run by the account owner after confirming the Cloudflare dashboard shows the Workers Free plan.

```powershell
npx wrangler login
npx wrangler whoami
npx wrangler d1 list
npx wrangler d1 create webkiln-v10-dev --location enam
```

Copy the returned D1 `database_id` into the `d1_databases[0].database_id` field in `wrangler.jsonc`. Do not invent or reuse an ID.

Then apply the checked-in migration and deploy the one development Worker:

```powershell
npx wrangler d1 migrations apply webkiln-v10-dev --remote --config wrangler.jsonc
npx wrangler secret put BETTER_AUTH_SECRET --config wrangler.jsonc
npx wrangler deploy --config wrangler.jsonc
```

Use the `workers.dev` URL printed by Wrangler as the development `AUTH_URL`, then update the development vars through Wrangler/dashboard and redeploy. Keep the frontend origin explicit; never use wildcard CORS with cookies.

Before deploying, confirm the command is still targeting the free account and that no paid plan, billing change, custom domain, R2 bucket, observability product, or payment method is being added.

## API boundary

Implemented routes:

- `GET /api/health`
- `ALL /api/auth/*`
- `GET /api/workspaces`
- `POST /api/workspaces`
- `GET /api/workspaces/:workspaceId/sites`
- `POST /api/workspaces/:workspaceId/sites`
- `GET /api/sites/:siteId/project`
- `PUT /api/sites/:siteId/project`
- `GET /api/sites/:siteId/revisions`

Every workspace and site read resolves the Better Auth session and checks membership on the server. IDs and roles supplied by the browser are never treated as authorization.

## Free-tier guardrails

- No R2 binding is present.
- No paid-only product is configured.
- Request payloads are limited to 8 MB at the application layer.
- Project saves use expected revision numbers and reject mismatches.
- D1 local testing is the default.
- Remote D1 migrations are a deliberate operator command, not an automatic deploy step.
