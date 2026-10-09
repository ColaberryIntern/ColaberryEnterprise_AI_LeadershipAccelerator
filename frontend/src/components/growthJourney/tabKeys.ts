/**
 * The nine Growth Journey tab keys (Phase 6, T614).
 *
 * Extracted from `GrowthJourneyPage.tsx` so the tab-view lookup in `tabViews.tsx`
 * can be typed by it without importing the page - a component importing its own
 * page would be a cycle, and the page already imports the lookup.
 *
 * These are the `?tab=` values, so they are part of the URL contract: renaming one
 * breaks a bookmarked link and the nav entry in `adminNav.ts`. The nine are the
 * phase's own carve-up of the system and do not change per brand.
 */
export type TabKey =
  | 'overview' | 'classification' | 'decisions' | 'shadow'
  | 'content' | 'handoffs' | 'experiments' | 'performance' | 'controls';
