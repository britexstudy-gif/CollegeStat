import { safeNext } from './domain';

/** Keep the user's research route through authentication without accepting external redirects. */
export function signInHref(destination: string) {
  const next = safeNext(destination);
  const returnTo = next.startsWith('/auth/') ? '/' : next;
  return '/auth/sign-in?' + new URLSearchParams({ next: returnTo === '/' ? '/dashboard' : returnTo, returnTo }).toString();
}
