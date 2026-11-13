import { PARTICIPANT_TOKEN_KEY } from './participantToken';

/**
 * C121: sign a brand-new Open House sign-up into the portal from a page that sits OUTSIDE ParticipantAuthProvider
 * (/open-house is a public route), then open their first assignment.
 *
 * It does what ParticipantAuthContext.login() does: store the token under the same key and drop the cached avatar, so
 * a shared device never shows the previous person's photo. Then it navigates with a full page load rather than a router
 * push, because only a fresh load makes the provider read the new token. The schedule cache that login() also resets is
 * in memory, so the full load clears it too.
 *
 * Returns false, and navigates nowhere, when the token cannot be stored (private mode, storage blocked) or when `next`
 * is not a portal path. The caller then shows the email path instead of a button that would land on a sign-in wall.
 */
export function startPortalSession(
  jwt: string,
  next: string,
  go: (url: string) => void = (url) => window.location.assign(url),
): boolean {
  // Only ever a same-site portal path. The server sends a fixed path; this is the second lock, not the first.
  const safeNext = /^\/portal\/[A-Za-z0-9/_-]*$/.test(next) ? next : '/portal/today';
  if (!jwt) return false;
  try {
    localStorage.setItem(PARTICIPANT_TOKEN_KEY, jwt);
    localStorage.removeItem('te_avatar');
    if (localStorage.getItem(PARTICIPANT_TOKEN_KEY) !== jwt) return false;
  } catch {
    return false;   // storage blocked: the welcome email's link still signs them in
  }
  go(safeNext);
  return true;
}
