# WebKiln v14

V14 adds a project-level design system stored in `editorSettings.designSystem`. Tokens use stable names such as `color.brand.primary`, and the editor emits reusable `--wk-*` CSS variables. Token usage counts are calculated from the current project payload; theme export is JSON.

Design Guardian findings are checks against available project data. Each finding includes severity, page, explanation, and a suggested fix. Safe fixes are opt-in. Site Health Center scores are labeled as calculated, estimated, or unavailable; performance and production security measurements remain unavailable until a deployed site is measured.
