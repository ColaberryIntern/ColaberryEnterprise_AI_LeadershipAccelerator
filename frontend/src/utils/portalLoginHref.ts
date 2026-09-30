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
