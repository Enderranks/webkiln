export type AppRoute =
  | { kind: 'local' }
  | { kind: 'login' }
  | { kind: 'signup' }
  | { kind: 'dashboard'; section?: string; workspaceId?: string; siteId?: string }
  | { kind: 'onboarding' }
  | { kind: 'editor'; siteId: string; preview?: boolean };

export function parseRoute(pathname = window.location.pathname): AppRoute {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/login') return { kind: 'login' };
  if (path === '/signup') return { kind: 'signup' };
  if (path === '/dashboard') return { kind: 'dashboard' };
  if (path === '/onboarding') return { kind: 'onboarding' };
  if (path === '/account') return { kind: 'dashboard', section: 'account' };
  const workspaceMatch = path.match(/^\/workspace\/([^/]+)$/);
  if (workspaceMatch)
    return { kind: 'dashboard', workspaceId: decodeURIComponent(workspaceMatch[1]) };
  const siteAreaMatch = path.match(
    /^\/site\/([^/]+)\/(cms|forms|automations|analytics|publishing|settings)$/,
  );
  if (siteAreaMatch) {
    const sectionMap: Record<string, string> = {
      cms: 'collections',
      forms: 'forms',
      automations: 'automations',
      analytics: 'overview',
      publishing: 'websites',
      settings: 'account',
    };
    return {
      kind: 'dashboard',
      section: sectionMap[siteAreaMatch[2]],
      siteId: decodeURIComponent(siteAreaMatch[1]),
    };
  }
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
