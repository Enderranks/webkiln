# WebKiln platform quality pass

## Verification commands

Run `npm run type-check`, `npm run worker:type-check`, `npm run lint`, `npm run format:check`, `npm test -- --run`, `npm run build`, `npm run worker:check`, and `npm run test:e2e`. Set `WEBKILN_E2E_BASE_URL` to a deployed development URL for remote smoke tests, or let Playwright start the local Vite preview. The E2E suite checks console errors, serious accessibility violations with axe, mobile overflow, protected routes, and cross-origin mutation rejection.

The complete authenticated journey requires a disposable development account and must be run against a seeded development environment. Do not put credentials in source, CI logs, or frontend environment variables. The journey should create a workspace, site, pages, tokens, collection content, form, preview, publish, public verification, republish, rollback, export, sign out, and protected-route verification.

## Backup and recovery runbook

1. Before a migration, confirm `git rev-parse HEAD`, `git ls-remote origin refs/heads/main`, and `npx wrangler d1 migrations list webkiln-v10-dev --remote --config wrangler.jsonc`.
2. Download a WebKiln backup from the dashboard for each development site and retain the project JSON plus collection export.
3. Apply migrations locally first, then remote; never edit an applied migration.
4. If a deployment fails, keep the last Worker version and use the existing source commit plus the last verified D1 migration state.
5. For data recovery, import the backup into a new development site first, verify pages, tokens, collections, forms, and publishing, then restore only with explicit approval.

## Data and query review

The D1 schema review retained indexes for workspace membership, site ownership, page ordering, CMS records, submissions, automation execution, and collaboration queries. List endpoints remain bounded and paginated; callers should use their limit/offset or cursor parameters rather than requesting an unbounded result set. The quality migration adds only the primary-key-backed authentication throttle table and does not alter existing data.

## Deployment checklist

- Free-tier account and existing Worker/D1 confirmed.
- No billing, payment method, R2, custom domain, email provider, or paid observability changes.
- Local migration, tests, build, Wrangler dry run, and E2E smoke tests pass.
- Remote migration list shows no pending migrations.
- Worker URL, version ID, `/api/health`, static root, protected API, and public published route are directly verified.
- Request ID, security headers, CSP, origin protection, auth limits, and payload limits are present.

## Rollback checklist

- Stop further deploys and record the failing Worker version and request IDs.
- Re-deploy the last verified source commit without changing D1.
- Verify `/api/health`, authentication, protected API status, public pages, and editor loading.
- If a migration is implicated, do not roll back schema destructively; restore data into a new development database only after review.

## Current risks

- The free-tier D1 auth throttle is deliberately bounded and not a substitute for a dedicated distributed rate-limit service.
- The full authenticated journey requires disposable test credentials and is not executed against production data.
- Public performance measurements require a browser performance run against a representative published site; build size warnings should be reviewed before production use.
- Email delivery, R2, billing, custom domains, and real-time collaboration remain disabled provider boundaries.
