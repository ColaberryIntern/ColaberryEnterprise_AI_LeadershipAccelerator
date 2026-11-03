/**
 * The preconditions that must hold before a re-mint clears a room's link.
 *
 * WHY THIS IS THE MOST IMPORTANT GUARD IN THE SCRIPT. The operation is destructive
 * first and constructive second: the existing link is cleared so `ensureRoomLink`
 * will mint, and only then is Zoom called. If the reserved host is not one the pool
 * will allocate, `reserveRoomHost` returns null, the mint silently falls back to the
 * default host, and the room is re-minted straight back onto the identity it was
 * supposed to move off - reproducing the collision while reporting success.
 *
 * An unverified host is the common way that happens, because registering a host and
 * proving it are two separate steps and the second is easy to skip.
 *
 * Pure and separate from argument parsing, so the rule is pinned by a test rather
 * than discovered by an operator mid-operation.
 */

export interface RegisteredHost {
  host_email: string;
  enabled: boolean;
  verified_at: Date | string | null;
}

export interface RemintTarget {
  slug: string;
  hostEmail: string;
}

/**
 * The first reason this re-mint must not proceed, or `null` when every target host
 * is registered, enabled and verified.
 *
 * Returns one reason rather than all of them deliberately: the operator fixes one
 * host and re-runs, and a list invites fixing the wrong one first.
 */
export function remintPreconditionError(
  targets: readonly RemintTarget[],
  hosts: readonly RegisteredHost[],
): string | null {
  for (const t of targets) {
    const wanted = t.hostEmail.trim().toLowerCase();
    const row = hosts.find((h) => String(h.host_email ?? '').trim().toLowerCase() === wanted);
    if (!row) {
      return `host not registered: ${t.hostEmail} — register it first, or the mint falls back to the default host`;
    }
    if (!row.enabled) {
      return `host is disabled: ${t.hostEmail} — the pool will not allocate it`;
    }
    if (!row.verified_at) {
      return `host is not verified: ${t.hostEmail} — run zoomHosts.ts verify, or the mint falls back to the default host`;
    }
  }
  return null;
}
