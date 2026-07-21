/**
 * The pure URL contract for the admin "open the workspace" read-only deep-link.
 * Isolated (no DB/model imports) so it is trivially unit-testable and so the
 * PortalViewAsPage `next` parser and this builder can't drift apart.
 *
 * Shape: `<base>/portal/view-as#t=<jwt>&next=%2Fportal%2Fruntime%2F<cardId>`
 * — the read_only participant JWT rides in the URL HASH (kept out of query
 * strings, server logs and referrers, exactly like the "View as member" link),
 * and `next` deep-links the portal straight into the card's runtime workspace.
 */
export function buildViewAsWorkspaceUrl(base: string, token: string, cardId: string): string {
  const root = (base || 'https://enterprise.colaberry.ai').replace(/\/$/, '');
  const next = `/portal/runtime/${cardId}`;
  return `${root}/portal/view-as#t=${token}&next=${encodeURIComponent(next)}`;
}
