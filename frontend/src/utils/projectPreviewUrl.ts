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
  /** http(s) URL of the project's running app (highest priority — bypasses proxy). */
  direct_preview_url?: string | null;
  /** Often a relative proxy path like `/preview/shipces`. Used only as a fallback. */
  portfolio_url?: string | null;
  /** Mirrors the backend's `project.project_variables.direct_preview_url`. */
  project_variables?: { direct_preview_url?: string | null } | null;
}

/**
 * Build a preview URL for `route` in `project`. Returns null when no
 * preview base is configured.
 *
 *  - Absolute `route` (http(s)) → returned as-is. The user explicitly
 *    typed a full URL; we trust them.
 *  - direct_preview_url present → joined with `route`. This is the canonical
 *    path; bypasses the portal's proxy.
 *  - Else portfolio_url present → joined with `route`. Will be a relative
 *    URL when portfolio_url itself is relative, which is fine — the iframe
 *    resolves it against the current document, which is the portal. The
 *    portal's proxy then forwards to the project.
 *  - Else null.
 */
export function buildPreviewUrl(
  project: ProjectPreviewSources | null | undefined,
  route: string,
): string | null {
  const cleanRoute = (route || '').trim();
  // Absolute URL provided by the user — return unchanged.
  if (/^https?:\/\//i.test(cleanRoute)) return cleanRoute;

  if (!project) return null;

  const directBase =
    project.direct_preview_url ||
    project.project_variables?.direct_preview_url ||
    '';

  if (directBase) {
    return joinUrl(directBase, cleanRoute);
  }

  const portfolio = project.portfolio_url || '';
  if (portfolio) {
    return joinUrl(portfolio, cleanRoute);
  }

  return null;
}

function joinUrl(base: string, route: string): string {
  const cleanBase = base.replace(/\/$/, '');
  if (!route) return cleanBase || '/';
  const cleanRoute = route.startsWith('/') ? route : '/' + route;
  return cleanBase + cleanRoute;
}
