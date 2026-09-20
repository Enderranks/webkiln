# WebKiln v20 · Collaboration foundation

V20 adds server-enforced collaboration records without real-time simultaneous editing. Workspace roles are owner, administrator, designer, content editor, reviewer, and viewer; legacy admin/editor records are normalized safely during migration. Authorization is evaluated from the authenticated session and D1 membership on every Worker route.

The Worker stores pending invitations, page permissions, component-pinned review comments, structured mention references, approval requests, review status, audit/activity events, and expiring review links. Invitation and review-link tokens are hashed in D1. The raw link is returned only at creation so it can be copied; email delivery is intentionally behind an unavailable provider boundary.

Ownership cannot be changed through ordinary role management, owners cannot be removed, review links expire, and tenant/resource relationships are checked server-side. Real-time collaboration is explicitly unavailable. Client review links are isolated from authenticated account data and report `realtime: false`.
