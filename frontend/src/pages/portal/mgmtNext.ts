/**
 * Where the Management Portal bridge (/portal/mgmt-enter) may send someone after it opens their admin session
 * (Colaberry Campus C6). An ALLOWLIST, not a pattern: anything else (another path, an absolute URL, a protocol-relative
 * "//host") is ignored and the bridge lands where it always has. That is what keeps `next` from being an open redirect.
 */
export const MGMT_NEXT_ALLOWLIST = ['/admin/growth-journey?tab=handoffs', '/admin/people', '/admin/accelerator'] as const;
export type MgmtNext = typeof MGMT_NEXT_ALLOWLIST[number];

/** The allowlisted destination named by a search string ("?next=..."), or null. */
export function allowedMgmtNext(search: string): MgmtNext | null {
  const next = new URLSearchParams(search).get('next');
  return (MGMT_NEXT_ALLOWLIST as readonly string[]).includes(next ?? '') ? (next as MgmtNext) : null;
}

/** A bridge link that lands on `next` once the admin session is open. */
export function mgmtBridgeTo(next: MgmtNext): string {
  return `/portal/mgmt-enter?next=${encodeURIComponent(next)}`;
}
