/**
 * useCoryAvailable — single source of truth for "can this operator reach Cory?"
 *
 * Two render contexts need this:
 *   - `/admin/*` routes: operator authenticated via `admin_token`; we have a
 *     full user object from `/api/admin/me`.
 *   - `/portal/*` routes: operator authenticated via `participant_token`;
 *     there's no participant /me endpoint, so we decode the JWT claims
 *     client-side to recover `email` + `role`.
 *
 * The gate returns true iff either context authorizes the operator (email
 * is `ali@colaberry.com` OR role is `super_admin`). Non-authorized
 * operators on either surface see no chips, no widget, no deeplinks.
 *
 * Caveat documented for the portal case: the actual Cory chat (`coryApi`)
 * still calls `/api/admin/intelligence/cory` with `admin_token`. If the
 * operator is on `/portal/*` and has NO `admin_token` in localStorage
 * (only `participant_token`), the gate may pass via JWT decode but the
 * chat call will 401. That's a separate auth scope question — this hook
 * only controls render gating; the API call's own surface displays its
 * auth error.
 */
import { useAdminUser } from './useAdminUser';
import { useEffect, useState } from 'react';

const AUTHORIZED_EMAIL = 'ali@colaberry.com';
const AUTHORIZED_ROLE = 'super_admin';

interface JwtClaims {
  email?: string;
  role?: string;
  // Other claims (sub, exp, iat, etc.) are ignored — we only gate on identity.
}

/**
 * Decode a JWT's payload (claims) without verifying the signature.
 * Safe for client-side gating: the server still enforces auth on every
 * API call. Returns null on any malformed input.
 */
function decodeJwtClaims(token: string | null): JwtClaims | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // base64url → base64 (replace -/_ with +/) then decode
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return {
      email: typeof payload?.email === 'string' ? payload.email : undefined,
      role: typeof payload?.role === 'string' ? payload.role : undefined,
    };
  } catch {
    return null;
  }
}

function isAuthorizedIdentity(claims: JwtClaims | { email: string; role: string } | null): boolean {
  if (!claims) return false;
  return claims.email === AUTHORIZED_EMAIL || claims.role === AUTHORIZED_ROLE;
}

export function useCoryAvailable(): boolean {
  const adminUser = useAdminUser();

  // Re-read participant_token on each render — it's a one-step localStorage
  // read, no React state needed. The hook re-evaluates on every render of
  // its caller, which is correct: the predicate must reflect the current
  // token state at paint time.
  const [participantClaims, setParticipantClaims] = useState<JwtClaims | null>(() =>
    decodeJwtClaims(localStorage.getItem('participant_token'))
  );

  // Refresh once on mount in case the token was set between initial-state
  // computation and effect run (login flow can update localStorage after
  // initial mount). Cheap; no network.
  useEffect(() => {
    setParticipantClaims(decodeJwtClaims(localStorage.getItem('participant_token')));
  }, []);

  if (adminUser && isAuthorizedIdentity(adminUser)) return true;
  if (isAuthorizedIdentity(participantClaims)) return true;
  return false;
}
