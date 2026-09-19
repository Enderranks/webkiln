export type AppRoute =
  | { kind: 'local' }
  | { kind: 'login' }
  | { kind: 'signup' }
  | { kind: 'dashboard' }
  | { kind: 'editor'; siteId: string };

export function parseRoute(pathname = window.location.pathname): AppRoute {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/login') return { kind: 'login' };
  if (path === '/signup') return { kind: 'signup' };
  if (path === '/dashboard') return { kind: 'dashboard' };
  const editorMatch = path.match(/^\/editor\/([^/]+)$/);
  if (editorMatch) return { kind: 'editor', siteId: decodeURIComponent(editorMatch[1]) };
  return { kind: 'local' };
}

export function navigate(path: string): void {
  window.location.assign(path);
}
