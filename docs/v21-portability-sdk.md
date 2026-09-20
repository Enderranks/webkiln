# WebKiln v21 · Portability and Component SDK

V21 provides clean static exports, scrubbed WebKiln backups, sitemap and CSV helpers, design-token output through the project backup, and a versioned component-package manifest. Exported HTML contains no editor runtime, editor controls, authentication data, workspace identifiers, secrets, or unpublished pages. Asset binaries are not invented: paths are relative and cloud asset storage remains provider-bound.

Component packages are JSON manifests plus markup/styles. Package validation rejects scripts, event-handler attributes, javascript URLs, unsupported SDK versions, and malformed manifests. Package migrations are trusted application functions represented by version metadata; arbitrary package code is never executed. Basic static HTML import preserves body markup as a local page and reports limitations for scripts, server behavior, third-party embeds, and external assets.
