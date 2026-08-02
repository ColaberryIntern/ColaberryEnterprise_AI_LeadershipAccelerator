/**
 * Pure resolver for AdminAcceleratorPage.tsx's `?tab=`/`?cohort=` deep-link
 * handling. Extracted specifically so this logic is testable without a DOM/React
 * render (this repo has no React Testing Library and adding one is a
 * dependency-introduction decision outside this task's scope).
 *
 * The bug this exists to fix: the page's original effects read these params
 * directly with an empty dependency array, so they only ever ran once at mount —
 * a same-route <Link> click (e.g. the Cohorts tab's per-row quick-nav buttons)
 * changes `searchParams` without unmounting the page, so those effects never
 * re-ran and the click silently did nothing after the very first navigation.
 * The caller now re-derives nav state from `searchParams` on every change (see
 * AdminAcceleratorPage.tsx) using this function, then clears the consumed params
 * from the URL — the same "consume and clear" pattern already used by this same
 * file's `?enrollment=` deep link, which never had this bug.
 */

export interface ResolveAcceleratorNavResult {
  /** Set when the `tab` param names a real, known tab and differs from the
   *  current one. */
  nextTab?: string;
  /** Set when the `cohort` param names a cohort already present in the known
   *  list and differs from the current selection. */
  nextCohortId?: string;
  /** Set when the `cohort` param names a cohort NOT in the known list (e.g. a
   *  closed/completed cohort not in the default open-only list) — the caller
   *  must fetch it individually before it can be selected. */
  needsCohortFetch?: string;
  /** True whenever either param was present and should be cleared from the URL
   *  after this call, even if it named the tab/cohort already active (so a
   *  repeated click on the same quick-nav link doesn't leave the param sitting
   *  in the URL forever). */
  consumedParams: boolean;
}

export function resolveAcceleratorNav(
  params: { tab: string | null; cohort: string | null },
  knownTabs: readonly string[],
  knownCohortIds: readonly string[],
  currentTab: string,
  currentCohortId: string
): ResolveAcceleratorNavResult {
  const { tab, cohort } = params;
  if (!tab && !cohort) {
    return { consumedParams: false };
  }

  const result: ResolveAcceleratorNavResult = { consumedParams: true };

  if (tab && knownTabs.includes(tab) && tab !== currentTab) {
    result.nextTab = tab;
  }

  if (cohort) {
    if (knownCohortIds.includes(cohort)) {
      if (cohort !== currentCohortId) result.nextCohortId = cohort;
    } else {
      result.needsCohortFetch = cohort;
    }
  }

  return result;
}
