import React from 'react';
import MarketingScopeStrip, { type MarketingScopeStripProps } from './MarketingScopeStrip';
import { PERFORMANCE_TAB_LABELS, scopeAppliesTo, type PerformanceTab } from './performanceTabs';

/**
 * PerformanceScopeBar - shows the brand/date filter only above the numbers it filters.
 *
 * WHY THIS EXISTS. `MarketingScopeStrip` used to render directly above the Performance tab
 * panels, all four of them. It filters ONE: `scopeToQuery()` is called in a single place on that
 * page, the Revenue tab's request to /api/admin/marketing/campaigns. The funnel graph takes no
 * props and fetches on its own; the campaign-links tab fetches /api/admin/campaigns and
 * /api/admin/marketing/channel-roi, and the latter's handler is declared `(_req, res)` so it
 * cannot read a date even if one were sent; outreach is a separate queue.
 *
 * `MarketingScopeStrip`'s own header says a dashboard that shows filtered numbers without
 * showing the filter is the ordinary way to mislead someone. The inverse is just as bad and is
 * what was shipped: showing a filter above numbers it does not filter. Someone narrows the range
 * to a week, reads the funnel, and draws a conclusion about a week from a figure covering
 * everything.
 *
 * SEPARATE COMPONENT, NOT AN INLINE TERNARY, so the rule is testable. `performanceTabs.test.ts`
 * can only prove `scopeAppliesTo()` returns the right booleans; it cannot prove the page asks.
 * The page is 1400 lines with lazy panels and four live requests, so the decision lives here
 * where a test can mount it - the same reason `BrandSetupTabs` and `MarketingStatTiles` are
 * their own files.
 */

export interface PerformanceScopeBarProps extends MarketingScopeStripProps {
  activeTab: PerformanceTab;
}

export default function PerformanceScopeBar({ activeTab, ...strip }: PerformanceScopeBarProps) {
  if (scopeAppliesTo(activeTab)) {
    return <MarketingScopeStrip {...strip} />;
  }

  // Said, rather than left to be inferred from the control's absence: an operator who set a
  // range on the Revenue tab and then switched here would otherwise assume it still applied.
  return (
    <div
      className="alert alert-light border m-3 mb-0 py-2 small text-muted"
      role="status"
      data-testid="scope-not-applied"
    >
      The brand and date filters apply to <strong>{PERFORMANCE_TAB_LABELS.revenue}</strong> only,
      so they are not shown here. The figures on this tab are not filtered by them.
    </div>
  );
}
