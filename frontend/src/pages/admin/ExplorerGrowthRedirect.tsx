import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import ExplorerGrowthPage from './ExplorerGrowthPage';
import { useGrowthJourneyData } from '../../components/growthJourney/useGrowthJourneyData';
import { getStatusRegistry } from '../../services/growthJourneyApi';

/**
 * `/admin/explorer-growth` now leads to the merged page - conditionally.
 *
 * ─── WHY IT BRANCHES ON TWO FIELDS, NOT ONE ─────────────────────────────────
 *
 * The first draft of this task redirected whenever the master flag was on, and
 * ALWAYS appended `brand=<colaberry-training uuid>`. Combined with how
 * authorization actually works, that is a day-one disaster: `tenant_memberships`
 * holds zero rows in production, so `scopedContext` refuses any request naming a
 * brand, and `ScopeState` correctly renders ZERO ROWS for a refused read.
 *
 * Every person who followed their Explorer Growth bookmark would have landed on
 * a page showing NOTHING, on the day this ships, with the old page no longer
 * reachable. My own handoff then told Ali to expect 1,200 learners on that
 * screen.
 *
 * The registry already carries `memberships_populated`, and this component is
 * already reading the registry, so the fix costs nothing:
 *
 *   master OFF              -> render Explorer's page, untouched
 *   ON, memberships FALSE   -> redirect with NO brand param: the all-brands view
 *                              renders the full population, which is both useful
 *                              and true
 *   ON, memberships TRUE    -> redirect with Colaberry Training selected
 *   registry read FAILED    -> render Explorer's page: fail toward the one that works
 *   still loading           -> a spinner, and redirect only once the answer is in
 *
 * Neither state shows one brand's rows under another's name, which is the whole
 * point of the build this redirect completes.
 *
 * ─── THE BRAND ID COMES FROM THE REGISTRY, NEVER A LITERAL ──────────────────
 *
 * The registry lists the brands with their slugs, so Colaberry Training's uuid is
 * looked up rather than hardcoded. A pasted uuid would be correct in production
 * and wrong in every other environment, and wrong SILENTLY - it would simply
 * select a brand that does not exist and render the out-of-scope state.
 *
 * If the slug is not in the registry the redirect omits the brand rather than
 * guessing one, which lands on the honest all-brands view.
 *
 * ─── CLIENT-SIDE, NOT NGINX ─────────────────────────────────────────────────
 *
 * The admin area is a single-page app served from one bundle, so a server
 * redirect needs a new location block. That is infrastructure, which the
 * contract puts behind an escalation rather than inside this PR.
 */

/** Explorer's tab keys mapped onto the merged page's. */
const TAB_MAP: Record<string, string> = {
  overview: 'overview',
  campus: 'campus',
  // Explorer called the roster "journey"; the merged page calls it what it is.
  journey: 'learners',
  decisions: 'decisions',
  shadow: 'shadow',
  content: 'content',
  // `brain` and `settings` are Explorer's WRITE surfaces, which the contract
  // defers: "they stay reachable nowhere in this build". They fall back with
  // everything else rather than landing on a tab that does not exist.
};

/**
 * `shadow`, not `overview`.
 *
 * Explorer's own `DEFAULT_TAB` is `shadow` (`ExplorerGrowthPage.tsx:76`), chosen
 * because the question this page exists to answer is "would the right thing have
 * gone out". Sending someone who bookmarked the bare URL to a different tab than
 * they have always landed on is a small, daily, avoidable annoyance, so the
 * fallback matches - for a missing tab and for an unknown one alike.
 */
export const REDIRECT_DEFAULT_TAB = 'shadow';

export const EXPLORER_BRAND_SLUG = 'colaberry-training';

/** Exported for the test: the mapping is data, so it is asserted as data. */
export function mapTab(raw: string | null): string {
  if (!raw) return REDIRECT_DEFAULT_TAB;
  return TAB_MAP[raw] ?? REDIRECT_DEFAULT_TAB;
}

export default function ExplorerGrowthRedirect() {
  const [searchParams] = useSearchParams();
  const registry = useGrowthJourneyData(getStatusRegistry, 'registry:redirect');

  if (registry.loading) {
    // No redirect until the answer is in. Guessing and correcting would put two
    // entries in the back button and flash the wrong page.
    return (
      <div className="container py-5 text-center text-muted" role="status" aria-live="polite">
        <div className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
        Loading…
      </div>
    );
  }

  // Fail toward the page that works. A registry outage is not a reason to send
  // somebody to a surface whose own guards we could not read.
  if (registry.error || !registry.data) return <ExplorerGrowthPage />;

  // The merged page does not exist while the journey is dark, so the old page is
  // still the right answer - and it is the flag-off fallback the contract keeps
  // Explorer's components on disk for.
  if (!registry.data.flags.master) return <ExplorerGrowthPage />;

  const tab = mapTab(searchParams.get('tab'));
  const next = new URLSearchParams({ tab });

  if (registry.data.memberships_populated) {
    const brand = registry.data.brands.find((b) => b.slug === EXPLORER_BRAND_SLUG);
    // No brand in the registry means no brand in the URL. The all-brands view is
    // honest; a guessed uuid would render the out-of-scope state and look broken.
    if (brand) next.set('brand', brand.id);
  }

  return <Navigate to={`/admin/growth-journey?${next.toString()}`} replace />;
}
