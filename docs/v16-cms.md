# WebKiln v16 CMS

V16 adds workspace-scoped D1 collections, typed fields, records, bounded search/pagination, CSV import/export, draft/published record status, and an editor binding panel. Rich text is sanitized at the Worker boundary. Reference fields are resolved inside the collection workspace; public rendering only reads records whose status is `published`.

Bindings are stored as GrapesJS attributes (`data-wk-collection`, `data-wk-field`, fallback and empty behavior). The public Worker resolves at most 50 bindings per page and 100 published records per binding, keeping free-tier queries bounded. Collection and record access always starts with the authenticated user’s workspace membership.

Collection pages, list pages, related-record UI, category/tag routing, and dynamic SEO templates use the same binding model but remain an incremental follow-up surface. No R2 or paid service is required.
