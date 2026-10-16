import type { LandingPage, LandingPageTrafficRow } from '../../../services/landingPageApi';

/**
 * Putting each page's traffic on its own row.
 *
 * WHY THIS IS A MODULE AND NOT TWO LINES IN THE TABLE. The traffic endpoint reports every hosted
 * page across ALL brands, while the table shows one brand's pages. Joining those two lists is the
 * only part of this screen that can be quietly wrong: a mismatch does not throw, it just prints
 * somebody else's visitor count beside your page, and nothing on screen would look odd.
 *
 * THE KEY IS THE PATH, NOT THE SLUG. Two brands can both have a page called `open-house`, so a
 * slug-only join would show Refactored's numbers on Training's row. The public path carries the
 * brand, so it is the only key that cannot collide. The traffic row states its brand and slug
 * separately and the page carries `path`, so the path is rebuilt from the row and compared.
 *
 * AN UNPUBLISHED PAGE HAS NO PATH AND GETS NO NUMBERS, which is correct rather than a gap: it
 * has never been served, so a zero would be a measurement and a dash is the truth.
 */

/** The public path a traffic row describes: `/lp/<brand>/<slug>`. */
export function trafficPath(row: Pick<LandingPageTrafficRow, 'brand_slug' | 'slug'>): string {
  return `/lp/${row.brand_slug ?? ''}/${row.slug}`;
}

/** Traffic keyed by the path it was measured on, so a row can find its own numbers. */
export function statsByPath(traffic: readonly LandingPageTrafficRow[]): Map<string, LandingPageTrafficRow> {
  const byPath = new Map<string, LandingPageTrafficRow>();
  for (const row of traffic) byPath.set(trafficPath(row), row);
  return byPath;
}

/** This page's traffic, or null when it has never been served under a path we measured. */
export function statsForPage(
  page: Pick<LandingPage, 'path'>,
  byPath: Map<string, LandingPageTrafficRow>,
): LandingPageTrafficRow | null {
  if (!page.path) return null;
  return byPath.get(page.path) ?? null;
}

/**
 * The one-line summary for a collapsed row.
 *
 * People first, loads last. `visitors` is how many people arrived; `views` counts refreshes and
 * is always the flattering number, so leading with it would overstate reach on every row of the
 * table at once.
 */
export function rowSummary(stats: LandingPageTrafficRow | null): string {
  if (!stats) return 'Not published yet';
  if (stats.visitors === 0) return 'No visitors yet';
  const people = `${stats.visitors} visitor${stats.visitors === 1 ? '' : 's'}`;
  if (stats.cta_clickers === 0) return `${people}, none clicked`;
  return `${people}, ${stats.cta_clickers} clicked`;
}
