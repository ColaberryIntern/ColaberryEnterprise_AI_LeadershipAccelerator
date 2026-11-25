import { safeNextPath } from './safeNextPath';

/**
 * Where to send a student whose session just died, so signing in returns them
 * to the page they were on instead of the generic dashboard.
 *
 * Why this exists: the QR class check-in page auto-POSTs /join as soon as it
 * sees a token. `isAuthenticated` is only `!!token` — it does not inspect
 * expiry — so a student returning with a stale 7-day JWT still triggers that
 * POST, takes a 401, and used to be thrown at a bare `/portal/login` with the
 * class identity gone. Signing in then landed them on /portal/today, so
 * attendance was never recorded and re-scanning simply repeated the loop.
 *
 * Reproduced against production 2026-08-24 on the Week 5 session: a stale token
 * yields `POST /join -> 401 -> window.location = /portal/login` with no `next`.
 * In the 8 days to 2026-08-24, 18 students requested 5 or more access links
 * (worst case 18) — the signature of that loop. Same defect class as the
 * 2026-08-03 outage (7 students), whose fix patched PortalVerifyPage only and
 * never reached the axios interceptor.
 *
 * Lives in its own module (rather than beside the interceptor in portalApi.ts)
 * so it is unit-testable without pulling axios into the test graph.
 *
 * Pure: reads no globals, throws nothing.
 */
export function loginHrefPreserving(pathname: string): string {
  const here = safeNextPath(pathname);
  // Never point `next` back at the login page itself (redirect loop) or at
  // /portal/verify (its token is already spent). Anything safeNextPath rejects
  // is dropped rather than trusted.
  if (!here || here === '/portal/login' || here === '/portal/verify') return '/portal/login';
  return `/portal/login?next=${encodeURIComponent(here)}`;
}

/**
 * Whether a 401 on this page should send the browser to the sign-in page.
 *
 * NOT on the class check-in page (Ali, 2026-11-23: "It should not be a login at all. They just put
 * their name and email"). That page needs no sign-in, but the portal layout around it (live badge,
 * mini-player, campus) still calls signed-in endpoints when the browser holds a portal token, and an
 * EXPIRED token there used to throw the attendee onto the login page before they saw the form.
 * The token is still cleared by the caller; only the redirect is skipped.
 *
 * Pure: reads no globals, throws nothing.
 */
export function redirectsToLoginOn401(pathname: string): boolean {
  if (!pathname.startsWith('/portal')) return false;
  // The class recap (WL1.2) is the same: opened from an email by people with no account.
  return !pathname.startsWith('/portal/class-checkin/') && !pathname.startsWith('/portal/class-recap/');
}
