import { safeNext } from './domain';
import { isStaffPath, STAFF_SIGN_IN } from './staff-route';

/** Keep the user's research route through authentication without accepting external redirects. */
export function signInHref(destination: string) {
  const next = safeNext(destination);
  const returnTo = next.startsWith('/auth/') ? '/' : next;
  if (isStaffPath(returnTo)) return STAFF_SIGN_IN + '?' + new URLSearchParams({ next: returnTo }).toString();
  return '/auth/sign-in?' + new URLSearchParams({ next: returnTo === '/' ? '/dashboard' : returnTo, returnTo }).toString();
}

/**
 * The browser keeps the Supabase session in localStorage, so the server cannot
 * read it. The client sets this cookie while a session exists (provider.tsx)
 * so the proxy can send signed-out visitors to sign-in before the dashboard
 * renders. It is only a routing hint: data access still needs the real
 * session token and row-level security.
 */
export const SESSION_HINT_COOKIE = 'cs_session';

export const isDashboardPath = (pathname: string) =>
  pathname === '/dashboard' || pathname.startsWith('/dashboard/');

/** Sign-in URL for a signed-out request to /dashboard or /dashboard/*, else null. */
export function dashboardSignInRedirect(pathname: string, search: string, hasSessionHint: boolean) {
  if (hasSessionHint || !isDashboardPath(pathname)) return null;
  return signInHref(pathname + (search && search !== '?' ? (search.startsWith('?') ? search : '?' + search) : ''));
}

/** Client only: keep the routing hint in step with the Supabase session. */
export function writeSessionHint(signedIn: boolean) {
  try {
    const secure = location.protocol === 'https:' ? '; secure' : '';
    document.cookie = signedIn
      ? `${SESSION_HINT_COOKIE}=1; path=/; max-age=2592000; samesite=lax${secure}`
      : `${SESSION_HINT_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
  } catch {}
}

/** Where onboarding lives; brand-new accounts land here once. */
export const WELCOME_PATH = '/dashboard/welcome';

type UserTimes = { email_confirmed_at?: string | null; confirmed_at?: string | null; last_sign_in_at?: string | null; created_at?: string | null };

/**
 * A first-time account confirms its email and signs in in the same request, so
 * the two timestamps coincide. A returning user's confirmation is older.
 */
export function isFirstSignIn(user: UserTimes | null | undefined) {
  const confirmed = Date.parse(user?.email_confirmed_at || user?.confirmed_at || '');
  const signedIn = Date.parse(user?.last_sign_in_at || '');
  if (Number.isNaN(confirmed) || Number.isNaN(signedIn)) return false;
  return Math.abs(signedIn - confirmed) < 2 * 60 * 1000;
}

/**
 * Where to go after a verified code or magic link. The return URL is always
 * validated with safeNext. New students answer the welcome questions first;
 * staff and password-reset targets are never rerouted.
 */
export function postAuthDestination(next: string | null, user: UserTimes | null | undefined, opts: { recovery?: boolean } = {}) {
  if (opts.recovery) return '/auth/reset-password';
  const target = safeNext(next);
  if (isStaffPath(target)) return target;
  return isFirstSignIn(user) ? WELCOME_PATH : target;
}
