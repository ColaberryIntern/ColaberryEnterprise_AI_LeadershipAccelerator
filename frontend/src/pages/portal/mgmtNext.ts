import { ALL_LINKS } from '../../components/Layout/adminNav';

/**
 * Where the Management Portal bridge (/portal/mgmt-enter) may send someone after it opens their admin session
 * (Colaberry Campus C6). An ALLOWLIST, not a pattern: anything else (another path, an absolute URL, a protocol-relative
 * "//host", a path with an extra segment or a query string that is not listed) is ignored and the bridge lands where it
 * always has. That is what keeps `next` from being an open redirect.
 *
 * Campus HQ (H3): the list is the three C6 destinations plus EVERY internal admin page in the admin sidebar (ALL_LINKS),
 * by exact string, so every room in the HQ building can open through the bridge. Adding a link to adminNav.ts allows it
 * here with no other edit. External links (My Day) are not internal paths and never enter the list. Reaching a page is
 * still decided by the admin session's sections (mgmtSectionGate); this list only decides where the redirect may point.
 */
const C6_DESTINATIONS = ['/admin/growth-journey?tab=handoffs', '/admin/people', '/admin/accelerator'];

/** The allowlist for a given sidebar (an injectable nav keeps "add a link and it is allowed" testable). */
export function mgmtNextAllowlist(links: ReadonlyArray<{ path: string }> = ALL_LINKS): readonly string[] {
  return Array.from(new Set([...C6_DESTINATIONS, ...links.map((l) => l.path).filter((p) => p.startsWith('/admin/'))]));
}
export const MGMT_NEXT_ALLOWLIST: readonly string[] = mgmtNextAllowlist();

/** The allowlisted destination named by a search string ("?next=..."), or null. */
export function allowedMgmtNext(search: string, allowlist: readonly string[] = MGMT_NEXT_ALLOWLIST): string | null {
  const next = new URLSearchParams(search).get('next');
  return next !== null && allowlist.includes(next) ? next : null;
}

/** A bridge link that lands on `next` once the admin session is open. A destination that is not allowlisted gets the
 *  plain bridge (the default landing), so a caller can never build a link that silently points somewhere else. */
export function mgmtBridgeTo(next: string): string {
  return MGMT_NEXT_ALLOWLIST.includes(next) ? `/portal/mgmt-enter?next=${encodeURIComponent(next)}` : '/portal/mgmt-enter';
}
