/**
 * todayFeedTypes — the shared item/page/row shapes for the Today feed, split out
 * of todayFeedComposer.ts (2026-08-12, daily-refresh build) purely to keep that
 * file under CLAUDE.md's 500-line hard ceiling. Pure types, no logic, no I/O.
 *
 * Lives in its own module (rather than folded into either composer.ts or the new
 * todayFeedCapeRanking.ts) specifically so both of those files — and every other
 * consumer across the codebase (capeLearningValueRanker.ts, todayAnchoredSources.ts,
 * feedControlService.ts, capeTodayPlanService.ts, ...) — can import `TodayFeedItem`
 * without creating a circular value-dependency between composer.ts and the ranking
 * module (CLAUDE.md: "a dependency two modules share belongs in a third module
 * they both import, never A→B→A"). todayFeedComposer.ts re-exports everything here
 * so no existing `from './todayFeedComposer'` import site needed to change.
 */
import { type FeedVideo, type FeedBlog, type FeedContent } from './timelineService';
import { type TodayItemKind } from './todayFeedPlan';

export interface TodayFeedItem {
  position: number;
  kind: TodayItemKind;
  ref: string;                 // `card:<id>` | `<provider>:<mediaId>`
  surface: string;             // home_surface of the type (drives the section colour)
  type: string;                // curriculum type slug
  render_band: string;
  card_id: string | null;      // anchored deep-link target (open/complete)
  title: string | null;
  subtitle: string | null;
  description: string | null;
  image: string | null;
  video: FeedVideo | null;
  blog: FeedBlog | null;
  content: FeedContent | null;
  week: number | null;
  estimated_time: number | null;
  status: string | null;       // anchored progress status
  points?: { learning?: number; builder?: number; community?: number } | null;  // engagement points the card awards (anchored curriculum cards)
  interacted: boolean;
  author?: { name: string; avatar_url: string | null; level: number } | null;  // community posts: the member byline
}

export interface TodayPage {
  items: TodayFeedItem[];
  nextCursor: number;
  exhausted: boolean;          // true only when even ambient produced nothing (empty pools)
}

export interface ImpressionRow {
  position: number;
  kind: TodayItemKind;
  ref: string;
  provider: string | null;
  card_id: string | null;
  item: any;                   // stored TodayFeedItem payload
  interacted_at: Date | null;
  served_at: Date;
}
