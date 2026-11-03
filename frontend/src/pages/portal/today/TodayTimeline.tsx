import React from 'react';
import { TimelineFeedCard } from '../../../components/timeline/TimelineCard';
import TodayFeedV2 from './TodayFeedV2';
import type { Category } from './todayCategoryFilter';
import TimelineFilterChips from './TimelineFilterChips';
// This section renders .te-feed / .te-feed-head /
// .te-feed-filter / .fchip, all of which are defined ONLY in feed.css. It used
// to reach the bundle just via the CommunityPage / RoomsPage / FeedCard lazy
// chunks, so a cold load of /portal/today — the default portal landing — had
// none of those rules: the header icon fell back to the UA default (measured
// at 462x462 in production on 2026-08-24) and the filter chips rendered as
// raw default buttons. feed.css is fully scoped to .te-feed*, so importing it
// here cannot leak into other surfaces.
import '../feed/feed.css';

/**
 * "Your timeline": the aggregated feed at the bottom of Today, with its filter chips. Moved out of TodayShell (C101:
 * the shell was 657 lines against a 500-line ceiling); the markup is unchanged and the state stays in TodayShell.
 */
export interface TodayTimelineProps {
  /** CAPE Today Plan flag: turns on the filter chips and the per-category counts. */
  capeTodayPlan: boolean;
  categoryFilter: Category | 'all';
  categoryCounts: Record<Category, number>;
  onFilterChange: (next: Category | 'all') => void;
  onCounts: (counts: Record<Category, number>) => void;
  planRefs: Set<string> | null;
  curriculum: TimelineFeedCard[];
  onOpen: (card: TimelineFeedCard) => void;
  onComplete: (card: TimelineFeedCard) => Promise<void> | void;
}

const TodayTimeline: React.FC<TodayTimelineProps> = (p) => (
  /* ── aggregated timeline — the big feed pulling from every page ──
      id is the "See your timeline" scroll target above. */
  <div className="te-feed" id="te-timeline-anchor">
    <div className="te-feed-head">
      <span className="h">
        {/* Explicit width/height as well as the CSS rule: an SVG with
            neither falls back to the UA default ~300x150 the moment its
            stylesheet is missing, which is exactly what shipped here and
            in the 2026-08-04 CAPE incident. Belt and braces. */}
        <svg viewBox="0 0 24 24" fill="none" width={16} height={16}><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5L19 19M19 5l-2.5 2.5M7.5 16.5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="2" /></svg>
        Your timeline · everything in one place
      </span>
    </div>
    <TimelineFilterChips
      enabled={p.capeTodayPlan}
      filter={p.categoryFilter}
      counts={p.categoryCounts}
      onChange={p.onFilterChange}
    />
    {/* Gated on planRefs !== null — closes the mount-order race. */}
    {p.planRefs !== null && (
      <TodayFeedV2
        fallbackCards={p.curriculum}
        onOpen={p.onOpen}
        onWorkspace={p.onOpen}
        onComplete={p.onComplete}
        excludeRefs={p.planRefs}
        filter={p.capeTodayPlan ? p.categoryFilter : undefined}
        onCounts={p.capeTodayPlan ? p.onCounts : undefined}
      />
    )}
  </div>
);

export default TodayTimeline;
