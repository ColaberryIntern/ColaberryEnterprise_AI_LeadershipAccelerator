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
