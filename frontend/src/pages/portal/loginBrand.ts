/**
 * Which brand the Participant Portal sign-in wears.
 *
 * ONE PAGE, TWO AUDIENCES. enterprise.colaberry.ai/portal/login is the only sign-in
 * there is, and two different sites send people to it:
 *  - the enterprise site's own header ("Log in"), its emails and its portal routes;
 *  - training.colaberry.com's header "Log In" button (colaberry-training-migration,
 *    src/components/training-site/SiteHeader.tsx, LOGIN_URL), used by career-school
 *    students.
 *
 * Ali, 2026-11-17: the login page "needs to be updated. Make sure it doesn't conflict
 * with the training site." He chose two looks on one page: enterprise visitors get the
 * Colaberry Enterprise design (blue mark, ENTERPRISE tag), and students arriving from
 * the training site keep the red-and-green Training look they already know. The sign-in
 * itself (endpoint, `next`, errors) is identical for both.
 *
 * HOW A TRAINING VISITOR IS RECOGNISED, strongest first:
 *  1. `?brand=training` on the URL. The training site's Log In link carries it.
 *  2. The referrer is training.colaberry.com. Browsers send the origin cross-site by
 *     default, so this covers the training link before (or without) the parameter.
 * Anything else is the enterprise default. Unknown `brand` values are ignored, never
 * trusted as free text.
 */
export type LoginBrand = 'enterprise' | 'training';

const TRAINING_HOSTS = ['training.colaberry.com'];

export function resolveLoginBrand(search: URLSearchParams, referrer: string): LoginBrand {
  const asked = (search.get('brand') || '').trim().toLowerCase();
  if (asked === 'training') return 'training';
  if (asked === 'enterprise') return 'enterprise';
  if (referrer) {
    try {
      const host = new URL(referrer).hostname.toLowerCase();
      if (TRAINING_HOSTS.some((h) => host === h || host === `www.${h}`)) return 'training';
    } catch {
      /* not a URL: ignore */
    }
  }
  return 'enterprise';
}

/**
 * Where "Back to ..." goes, and the site it names, per brand. On a phone the page shows
 * only "Back": beside the enterprise lockup the full sentence pushed the page to 448px
 * on a 390px screen.
 */
export const LOGIN_BRAND_BACK: Record<LoginBrand, { href: string; site: string }> = {
  enterprise: { href: '/', site: 'enterprise.colaberry.ai' },
  training: { href: 'https://training.colaberry.com', site: 'training.colaberry.com' },
};
