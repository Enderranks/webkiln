# WebKiln v17 forms and automations

V17 stores typed form definitions, bounded D1 submissions, automation graphs, and execution history in the existing workspace database. Public form submissions only accept active forms belonging to published sites, validate fields on the Worker, reject honeypot spam without revealing storage state, enforce idempotency keys, and keep the latest 100 submissions available to authorized workspace members.

Automations use `triggerType -> conditions -> actions`. Enabled flows are capped at 50 flows per event, 3 retry attempts, and one execution per automation/event idempotency key. Webhooks require HTTPS and execute server-side; webhook configuration is never emitted to frontend bundles. Email actions fail visibly with `Email provider not connected` because WebKiln does not provision email delivery in the free-tier environment.

File uploads are intentionally excluded until the approved asset-storage milestone. D1 query limits and form submission caps are deliberate free-tier guardrails.
