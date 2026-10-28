// Decode the (already-trusted-server-side) claims from a participant JWT for
// display only — e.g. to show the read-only "view as" banner. Never used for
// authorization; the server is the source of truth. Base64url-safe, fail-soft.
export interface ParticipantTokenClaims {
  sub?: string;
  email?: string;
  cohort_id?: string;
  read_only?: boolean;
  impersonated_by?: string;
}

export function decodeParticipantClaims(token: string | null): ParticipantTokenClaims | null {
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as ParticipantTokenClaims;
  } catch {
    return null;
  }
}

export const PARTICIPANT_TOKEN_KEY = 'participant_token';
// Admin "View as member" (read-only) is minted into ONE browser tab via
// PortalViewAsPage. It lives in sessionStorage, not localStorage: localStorage
// is shared across every tab of this origin, so writing the impersonated token
// there would silently overwrite the admin's own real session in every other
// open tab. sessionStorage is tab-scoped and clears when the tab closes, which
// matches the intended lifetime of a "View as" preview.
export const VIEW_AS_TOKEN_KEY = 'view_as_participant_token';

/**
 * The single source of truth for "what participant token does THIS tab use".
 * A tab-local "View as" preview (sessionStorage) always wins over the real
 * logged-in session (localStorage) so the admin sees the impersonated member's
 * portal in that tab, without touching the real session anywhere else.
 * Every read of the participant auth token — API clients, hooks, components —
 * must go through this helper instead of reading localStorage directly.
 */
export function getParticipantToken(): string | null {
  return sessionStorage.getItem(VIEW_AS_TOKEN_KEY) || localStorage.getItem(PARTICIPANT_TOKEN_KEY);
}

/**
 * Is THIS tab an admin's read-only "View as member" session? Driven by the token's `read_only`
 * claim, not by which storage the token came from, so a non-impersonation token parked in
 * sessionStorage does not read as one.
 *
 * Canonical here rather than in `components/campus/campusApi`, where this logic started.
 * `campusApi` now delegates to it, because anything outside the campus that asks this question
 * should not have to import the campus API module to do so: partial `jest.mock`s of that module
 * are common, and one of them returned `undefined` for the function and crashed the portal
 * shell in CI. Display/UI decisions only -- the server is the source of truth and enforces
 * read-only centrally in `requireParticipant`.
 */
export function isReadOnlyParticipantSession(): boolean {
  return decodeParticipantClaims(getParticipantToken())?.read_only === true;
}
