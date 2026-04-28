/**
 * Project Preview URL builder.
 *
 * The portal lives at enterprise.colaberry.ai but the user's project lives
 * at its own URL (their `direct_preview_url`, e.g. `http://95.216.199.47:8889`,
 * or behind a proxy at `portfolio_url`, e.g. `/preview/shipces`). Any iframe
 * preview that constructs a URL must use the project's preview base — never
 * the portal's own domain — or it ends up showing the portal's pages instead
 * of the project's pages (the cross-project leak).
 *
 * This is the single source of truth for "how do I preview a route in this
 * project?" Every iframe that previews user pages should call buildPreviewUrl.
 *
 * Safety contract:
 *   - Never returns a URL on the enterprise.colaberry.ai (or any portal) host
 *     unless the caller explicitly passed it as the project's preview base.
 *   - Returns null when the project has no preview base configured. The
 *     caller surfaces a "no preview available" state instead of falling
 *     back to a wrong domain.
 *   - User-typed absolute URLs (http:// or https://) pass through unchanged.
 */

export interface ProjectPreviewSources {
  /** http(s) URL of the project's running app. Used for "open in new tab" — bypasses proxy. */
  direct_preview_url?: string | null;
  /** Relative proxy path like `/preview/shipces`. Used for iframes (same-origin, no mixed-content block). */
  portfolio_url?: string | null;
  /** Mirrors the backend's `project.project_variables.direct_preview_url`. */
  project_variables?: { direct_preview_url?: string | null } | null;
}

export type PreviewContext = 'iframe' | 'newTab';

/**
 * Build a preview URL for `route` in `project`. Returns null when no
 * preview base is configured.
 *
 *   - Absolute `route` (http(s)) → returned as-is. The user explicitly
 *     typed a full URL; we trust them.
 *   - context: 'iframe' (default) — prefers portfolio_url (proxy path).
 *     The portal runs on HTTPS; if the project's direct URL is HTTP,
 *     the browser blocks the iframe (mixed content). The proxy stays
 *     same-origin and resolves cleanly. Falls back to direct only when
 *     no portfolio_url exists OR the direct URL is also HTTPS.
 *   - context: 'newTab' — prefers direct_preview_url so the user lands
 *     on the real running app instead of the proxy.
 *   - Else null. Caller should surface a "no preview configured" state
 *     instead of falling back to the portal's domain.
 */
export function buildPreviewUrl(
  project: ProjectPreviewSources | null | undefined,
  route: string,
  context: PreviewContext = 'iframe',
): string | null {
  const cleanRoute = (route || '').trim();
  // Absolute URL provided by the user — return unchanged.
  if (/^https?:\/\//i.test(cleanRoute)) return cleanRoute;

  if (!project) return null;

  const direct =
    project.direct_preview_url ||
    project.project_variables?.direct_preview_url ||
    '';
  const portfolio = project.portfolio_url || '';

  // Detect the mixed-content trap: the portal serves over HTTPS, so an
  // HTTP direct URL embedded in an iframe gets silently blocked. Prefer
  // the proxy path (portfolio_url) when this would happen.
  const portalIsHttps = typeof window !== 'undefined' && window.location && window.location.protocol === 'https:';
  const directIsInsecure = /^http:\/\//i.test(direct);
  const mixedContentBlock = portalIsHttps && directIsInsecure;

  if (context === 'iframe') {
    if (portfolio) return joinUrl(portfolio, cleanRoute);
    if (direct && !mixedContentBlock) return joinUrl(direct, cleanRoute);
    if (direct && mixedContentBlock) {
      // Last resort: try the direct URL anyway. Caller can detect the
      // empty iframe and surface "open in new tab" — better than null.
      return joinUrl(direct, cleanRoute);
    }
    return null;
  }

  // newTab — prefer direct
  if (direct) return joinUrl(direct, cleanRoute);
  if (portfolio) return joinUrl(portfolio, cleanRoute);
  return null;
}

/**
 * True when the current page is HTTPS and the project's only direct
 * URL is HTTP — meaning an iframe pointed at the direct URL will be
 * blocked. Callers can use this to render a clear "open in new tab"
 * fallback alongside (or instead of) the iframe.
 */
export function willBeMixedContentBlocked(project: ProjectPreviewSources | null | undefined): boolean {
  if (!project) return false;
  const direct = project.direct_preview_url || project.project_variables?.direct_preview_url || '';
  const portalIsHttps = typeof window !== 'undefined' && window.location && window.location.protocol === 'https:';
  return portalIsHttps && /^http:\/\//i.test(direct);
}

function joinUrl(base: string, route: string): string {
  const cleanBase = base.replace(/\/$/, '');
  if (!route) return cleanBase || '/';
  const cleanRoute = route.startsWith('/') ? route : '/' + route;
  return cleanBase + cleanRoute;
}
