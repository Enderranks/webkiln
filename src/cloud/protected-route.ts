import type { AppRoute } from './app-router';
import type { Session } from './contracts';

export function protectedRedirect(route: AppRoute, session: Session | null): string | null {
  if ((route.kind === 'dashboard' || route.kind === 'editor') && !session) {
    const target =
      route.kind === 'editor' ? `/editor/${encodeURIComponent(route.siteId)}` : '/dashboard';
    return `/login?returnTo=${encodeURIComponent(target)}`;
  }
  return null;
}
