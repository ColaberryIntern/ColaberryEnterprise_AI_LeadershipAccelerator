/**
 * Apply the learner's saved portal theme before the first render (C11).
 *
 * PortalShell owns the theme toggle and writes `te-theme`, but it sets data-theme on <html> only when IT mounts. The ~18
 * legacy portal pages that render PortalLayout instead never read it, so a learner who chose dark got a light page on every
 * reload of those pages (and a light flash before PortalShell pages). Scoped to /portal on purpose: the public site and the
 * admin app have no dark styles, and the same browser must not wake them up dark.
 *
 * Pure apart from the root element it is handed; storage can throw (private mode), which leaves the page light.
 */
export const PORTAL_THEME_KEY = 'te-theme';

export function applySavedPortalTheme(pathname: string, storage: Pick<Storage, 'getItem'> | null, root: HTMLElement): 'light' | 'dark' | null {
  if (pathname !== '/portal' && !pathname.startsWith('/portal/')) return null;
  let saved: string | null = null;
  try { saved = storage?.getItem(PORTAL_THEME_KEY) ?? null; } catch { return null; }
  if (saved !== 'dark' && saved !== 'light') return null;
  root.setAttribute('data-theme', saved);
  return saved;
}
