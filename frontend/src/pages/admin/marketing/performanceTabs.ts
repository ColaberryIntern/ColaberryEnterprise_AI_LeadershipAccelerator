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

/**
 * What each tab is CALLED, kept separate from the key it is addressed BY.
 *
 * The keys are an API - needsAttentionQueue.ts writes `?tab=registry` and `?tab=revenue` - so a
 * key is not free to change. The labels are for people, and these ones were internal names:
 * "Revenue Intelligence" and "Campaign Link Registry" are what the code calls them, not what an
 * operator would. Ali's prototype names them plainly, which is the same change made to the nav
 * on 2026-10-07 (Composer -> New post, Content queue -> All posts, Brand setup -> Brands &
 * channels). Renaming the label without touching the key is the whole point of this split.
 */
export const PERFORMANCE_TAB_LABELS: Record<PerformanceTab, string> = {
  funnel: 'Marketing funnel',
  revenue: 'Revenue',
  registry: 'Campaign links',
  outreach: 'AI outreach',
};

/**
 * The tabs that the brand/date scope above them actually filters.
 *
 * Only ONE does, which is why this exists. `scopeToQuery()` is called in exactly one place on
 * the Performance page: the Revenue tab's request to /api/admin/marketing/campaigns. The funnel
 * graph takes no props and fetches on its own. The campaign-links tab fetches
 * /api/admin/campaigns and /api/admin/marketing/channel-roi, and neither is given a date -
 * channel-roi's handler is declared `(_req, res)` and so cannot read one. Outreach is a
 * separate queue.
 *
 * The strip used to render above all four tabs, which implied it governed the page. A control
 * that silently does nothing is worse than an absent one: it invites a conclusion about a
 * number it never filtered. Found 2026-10-07 while checking this page against the prototype.
 *
 * Widening this set is a BACKEND change, not a UI one - those endpoints have to accept a range
 * before the control can honestly appear above them.
 */
export const SCOPE_FILTERED_TABS: readonly PerformanceTab[] = ['revenue'];

/** Whether the brand/date scope filters this tab, and may therefore be shown above it. */
export function scopeAppliesTo(tab: PerformanceTab): boolean {
  return SCOPE_FILTERED_TABS.includes(tab);
}
