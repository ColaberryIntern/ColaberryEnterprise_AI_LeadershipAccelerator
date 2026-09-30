/**
 * performanceTabs - which Performance tab a URL is asking for.
 *
 * Exists because Performance stopped being the landing page on 2026-09-18. The attention queue
 * on the Overview links here for broken tracking links, unmapped spend and unattributed traffic,
 * and before `?tab=` every one of those links opened on the funnel chart, leaving the operator to
 * work out which of four tabs the problem was on.
 *
 * The keys are also written by the BACKEND, in needsAttentionQueue.ts (`?tab=registry`,
 * `?tab=revenue`). A rename here without a rename there silently lands those links on the
 * funnel again; performanceTabs.test.ts pins the two values the backend sends.
 */

export const PERFORMANCE_TABS = ['funnel', 'revenue', 'registry', 'outreach'] as const;
export type PerformanceTab = typeof PERFORMANCE_TABS[number];

/**
 * The tab a link asked for, or the funnel. An unknown value falls back rather than erroring: a
 * stale bookmark should land somewhere, not nowhere.
 */
export function tabFromSearch(search: string): PerformanceTab {
  const requested = new URLSearchParams(search).get('tab');
  return (PERFORMANCE_TABS as readonly string[]).includes(requested ?? '')
    ? (requested as PerformanceTab)
    : 'funnel';
}
