/**
 * Read the `role` claim out of an admin JWT, client-side.
 *
 * Used for exactly one thing: choosing the post-login destination before
 * AuthContext's /me round-trip has resolved, so a scoped login never flashes a
 * dashboard it cannot read. Everything durable (nav gating, route gating) waits
 * for /me, where the server is the authority.
 *
 * The signature is NOT verified here, and it does not need to be — a forged
 * token buys a different landing page and nothing else, because every request
 * behind it is still checked by the backend.
 */
export function roleFromAdminToken(token: string | null | undefined): string | null {
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    // JWT uses base64url and drops the padding; atob wants base64 with it.
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded));
    return typeof claims?.role === 'string' && claims.role ? claims.role : null;
  } catch {
    return null;
  }
}
