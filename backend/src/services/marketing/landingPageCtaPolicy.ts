/**
 * Where a hosted landing page's buttons may send people (PH1, Ali 2026-11-19).
 *
 * WHY. A landing page has no form of its own: its buttons hand the visitor to one of the app's
 * signup pages. Ali decided every public signup/lead form requires a phone number, so the only
 * honest destinations for a landing-page button are the app routes whose form now requires one.
 * A button that pointed anywhere else would let an ad funnel collect people with no number, which
 * is exactly the gap PH1 closes.
 *
 * WHERE IT IS ENFORCED. At SAVE and DRAFT time only - the admin PATCH, the create/revise that
 * stores a generated draft, the operator-supplied draft destination, and publish. Deliberately NOT
 * in `landingPageContentSchema`, which the public renderer also runs: putting it there would turn
 * any already-live page with an older destination into a blank public URL the moment this
 * deploys. Live pages point at /open-house today, which is allowed, and they keep rendering.
 *
 * EXTERNAL URLS. An absolute URL is accepted only when its host is this app's own host
 * (`FRONTEND_URL`, the existing setting for where the app is served) AND its path is one of the
 * routes below. Any other site is refused: this repo cannot see whether that site's form asks for
 * a phone.
 */

/**
 * The phone-requiring app routes. A path matches exactly, or as a sub-path of an entry marked
 * `prefix` (the AI Pilot vertical pages live under /ai-pilot/...).
 */
export const PHONE_REQUIRING_CTA_ROUTES: ReadonlyArray<{ path: string; prefix?: boolean }> = [
  { path: '/open-house' },
  { path: '/portal/signup' },
  { path: '/enroll' },
  { path: '/ai-pilot', prefix: true },
  { path: '/try' },
  { path: '/demo-pilot' },
  { path: '/book' },
  { path: '/sponsorship' },
];

export const CTA_DESTINATION_MESSAGE =
  'Buttons on a landing page must go to a signup page that asks for a phone number: '
  + PHONE_REQUIRING_CTA_ROUTES.map((r) => (r.prefix ? `${r.path}/...` : r.path)).join(', ')
  + '. Links to other pages or other sites are not allowed.';

function appHost(): string | null {
  const raw = process.env.FRONTEND_URL;
  if (!raw) return null;
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return null;
  }
}

function pathAllowed(pathname: string): boolean {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return PHONE_REQUIRING_CTA_ROUTES.some((r) => p === r.path || (r.prefix === true && p.startsWith(`${r.path}/`)));
}

/** Is this button destination one of the phone-requiring signup routes? */
export function isAllowedCtaHref(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const href = raw.trim();
  if (href === '') return false;
  if (href.startsWith('/') && !href.startsWith('//')) {
    // Site-relative. Query and fragment are fine (UTM tags ride on these links).
    return pathAllowed(href.split(/[?#]/, 1)[0]);
  }
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const host = appHost();
  return host !== null && url.host.toLowerCase() === host && pathAllowed(url.pathname);
}

/**
 * Every button destination in a landing page's content that is NOT allowed, in document order.
 * Walks the whole tree rather than naming section types, so a new section type with a `cta`
 * cannot slip past this check.
 */
export function disallowedCtaHrefs(content: unknown): string[] {
  const out: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'cta' && value && typeof value === 'object' && !Array.isArray(value)) {
        const href = (value as Record<string, unknown>).href;
        if (!isAllowedCtaHref(href)) out.push(typeof href === 'string' ? href : String(href));
      }
      visit(value);
    }
  };
  visit(content);
  return out;
}
