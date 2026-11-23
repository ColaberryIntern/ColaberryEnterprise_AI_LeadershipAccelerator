/**
 * The Growth Journey tab keys.
 *
 * Extracted from `GrowthJourneyPage.tsx` so the tab-view lookup in `tabViews.tsx`
 * can be typed by it without importing the page - a component importing its own
 * page would be a cycle, and the page already imports the lookup.
 *
 * These are the `?tab=` values, so they are part of the URL contract: renaming one
 * breaks a bookmarked link and the nav entry in `adminNav.ts`.
 *
 * ─── FOURTEEN, AFTER THE EXPLORER GROWTH MERGE (2026-11-22, 2026-11-23) ─────
 *
 * Nine were the phase's own carve-up of the journey. Three joined when
 * `/admin/explorer-growth` merged into this page: `campus`, `learners` and
 * `brand-setup`.
 *
 * `brain` and `settings` joined on 2026-11-23, and the reason they were late is
 * worth keeping. The merge ported Explorer's READ tabs and left its write
 * surfaces out - but because `/admin/explorer-growth` now forwards here, leaving
 * them out did not park them, it removed them from the product. Their backend
 * routes stayed mounted and live the whole time with nothing able to reach them.
 * Ali, 2026-11-23: *"We are also missing the brain which is a very important
 * part."*
 *
 * Those two are also the only tabs here that do NOT follow the brand selector,
 * because the surfaces behind them are global rather than partitioned by brand.
 * Each one says so on its face; see `GlobalScopeNotice`.
 *
 * `overview`, `decisions`, `shadow` and `content` existed on BOTH pages under the
 * same name and now render EXPLORER'S version, per the execution contract's
 * assumption 1: Ali's words were "working how the current Explorer Growth
 * works", and Explorer's tabs are the ones with data behind them - 1,191
 * profiles and 612 decisions against the journey tables' zero rows.
 *
 * `brand-setup` is hyphenated because it is a URL value; the others are single
 * words and stay that way.
 */
export type TabKey =
  | 'overview' | 'campus' | 'learners' | 'decisions' | 'content' | 'shadow'
  | 'classification' | 'handoffs' | 'experiments' | 'performance' | 'controls'
  | 'brand-setup' | 'brain' | 'settings';
