# WebKiln v18 · Visual interactions

WebKiln v18 adds a typed interaction model to the existing project schema. Interactions are allowlisted trigger/action definitions stored in `editorSettings.interactions`; they do not contain executable JavaScript.

Supported triggers include page load, viewport entry/exit, click, hover, focus, form success, scroll position, and breakpoint change. Supported actions include visibility, classes, dialogs/drawers, tabs, accordions, scrolling, transforms, opacity, color, counters, and media playback.

The editor exposes timeline duration, delay, easing, sequence/parallel behavior, loops, device targeting, enable/disable, duplicate-ready serialized records, preview compatibility, and reduced-motion fallbacks. Reusable tabs, accordion, modal, drawer, tooltip, carousel, before/after, counter, sticky navigation, and announcement components are registered without inline handlers.

Published/runtime behavior is constrained to the allowlisted action set. Unsafe action names are discarded during normalization, selectors are queried defensively, and reduced-motion users receive an instant or skipped action according to the stored fallback. Dialogs should be authored with native `<dialog>` or the provided component semantics so keyboard focus and Escape behavior remain browser-managed.

Projects migrate from schema versions 1 and 2 to version 3 while preserving existing pages, responsive metadata, design tokens, CMS bindings, forms, and publishing state. No D1 migration or paid Cloudflare service is required because interactions are part of the project snapshot.
