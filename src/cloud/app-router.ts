export type AppRoute =
  | { kind: 'local' }
  | { kind: 'login' }
  | { kind: 'signup' }
  | { kind: 'dashboard' }
  | { kind: 'editor'; siteId: string; preview?: boolean };

export function parseRoute(pathname = window.location.pathname): AppRoute {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/login') return { kind: 'login' };
  if (path === '/signup') return { kind: 'signup' };
  if (path === '/dashboard') return { kind: 'dashboard' };
  const editorMatch = path.match(/^\/editor\/([^/]+)$/);
  if (editorMatch) {
    const siteId = decodeURIComponent(editorMatch[1]);
    const preview =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('preview') === '1';
    return preview ? { kind: 'editor', siteId, preview: true } : { kind: 'editor', siteId };
  }
  return { kind: 'local' };
}

export function navigate(path: string): void {
  window.location.assign(path);
}
