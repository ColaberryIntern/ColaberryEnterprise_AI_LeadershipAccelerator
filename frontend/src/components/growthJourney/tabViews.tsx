import React from 'react';
/*
 * `DecisionsTab`, `ShadowTab` and `ContentTab` are NO LONGER IMPORTED HERE.
 *
 * Not deleted - they are still on disk and still have their own test suites.
 * Explorer's versions of those three tabs now occupy those keys (see the
 * comment on TAB_VIEWS), so importing the journey's would be an unused import
 * and `CI=true` turns that into a failed build. Re-adding the three imports and
 * re-pointing the three entries is the whole of the reversal.
 */
import OverviewTab from './OverviewTab';
import ClassificationTab from './ClassificationTab';
import HandoffsTab from './HandoffsTab';
import ExperimentsTab from './ExperimentsTab';
import PerformanceTab from './PerformanceTab';
import ControlsTab from './ControlsTab';
import SummaryTiles from './explorers/SummaryTiles';
import DistributionPanel from './explorers/DistributionPanel';
import CampusPanel from './explorers/CampusPanel';
import OutreachPanel from './explorers/OutreachPanel';
import LearnersPanel from './explorers/LearnersPanel';
import DecisionsPanel from './explorers/DecisionsPanel';
import ShadowPanel from './explorers/ShadowPanel';
import ContentPanel from './explorers/ContentPanel';
import BrandRolePanel from './explorers/BrandRolePanel';
import type { JourneyTerminology } from './journeyWords';
import type { TabKey } from './tabKeys';

/**
 * Which Growth Journey tabs render content, as the ONLY statement of that fact
 * (Phase 6, T614).
 *
 * ── WHY THIS IS A LOOKUP AND NOT A LIST PLUS BRANCHES ───────────────────────
 *
 * The first draft kept a `BUILT` array in `GrowthJourneyPage.tsx` alongside five
 * separate `tab === '…' &&` branches - two parallel lists that could disagree, and
 * T614's verifier proved they did: dropping 'content' from `BUILT` rendered
 * ContentTab AND the "not built yet" panel at once, with all 194 cells green. The
 * same draft claimed in a comment that `adminNavGrowthJourney` asserted the array
 * against `TABS`; it did not, and that invented guarantee was the task's
 * criterion-6 failure.
 *
 * So the map below IS the answer. A tab is built if and only if it has an entry,
 * there is nothing to keep in step, and removing one makes the page fall through to
 * the unbuilt panel - which `GrowthJourneyPage.states.test.tsx` catches by mounting
 * every key here and asserting that tab's own heading renders AND that "not built
 * yet" does not. A mutant that re-keys an entry dies to the cell named for that
 * tab; a mutant that bypasses the lookup dies to all four at once.
 *
 * ── WHY THE CONTEXT COMES IN AS A PROP BAG ──────────────────────────────────
 *
 * The status registry is read ONCE at page level. Four children re-reading it would
 * be four requests against a 120/min per-admin budget for an answer that cannot
 * differ between them - and `terminology` lives only on that registry, not on any
 * of the nine inspect reads, so it has to be threaded rather than fetched.
 *
 * `ShadowTab` deliberately takes nothing: `/shadow/runs` accepts no `brand_id`,
 * zod strips one, and the response echoes `scope.brand_id: null`. Handing it a
 * brand would imply a scope it does not apply.
 */

export interface TabContext {
  words: JourneyTerminology;
  /** The resolved display name, for a sentence an operator reads. */
  brandName: string | null;
  /** The raw uuid, for a request that scopes by id. Both are needed, for different jobs. */
  brandId: string;
  unseeded: boolean;
  programId: string;
}

/**
 * ─── THE EXPLORER MERGE, AND WHAT IT REPLACED (2026-11-22) ──────────────────
 *
 * Six tabs now render EXPLORER GROWTH'S surfaces, brand-scoped. Four of those
 * six - `overview`, `decisions`, `shadow`, `content` - existed on both pages
 * under the same name, and the execution contract's assumption 1 settles which
 * wins: "Where both pages had a tab of the same name, Explorer's version wins",
 * because Ali asked for a page "working how the current Explorer Growth works"
 * and Explorer's tabs are the ones with data behind them.
 *
 * STATED PLAINLY BECAUSE IT IS A REMOVAL, NOT AN ADDITION. The journey's own
 * `DecisionsTab`, `ShadowTab` and `ContentTab` are no longer reachable from this
 * page. They read `growth_journey_decisions`, `growth_journey_classifications`
 * and the journey content registry, all of which held ZERO rows when this
 * shipped, so nothing visible is lost today - but the components stay on disk
 * and re-pointing these three entries is the whole of the reversal.
 *
 * `overview` is the exception: it renders Explorer's KPIs and distribution AND
 * then the journey's own readiness and health below, because those answer a
 * different question (is the machine running) from Explorer's (what shape is the
 * population in). Dropping them would have lost a surface rather than replaced
 * one.
 *
 * ─── THE BRAND ARRIVES AS `null`, NOT AS AN EMPTY STRING ────────────────────
 *
 * `TabContext.brandId` is `''` when no brand is selected, because it comes
 * straight from a query parameter. The scoped client distinguishes "no brand" -
 * which it sends as an ABSENT parameter, the honest unnarrowed read - from a
 * malformed empty one, which the server answers 400. So `c.brandId || null` is
 * the conversion, done once here rather than in nine panels.
 */
export const TAB_VIEWS: Partial<Record<TabKey, (ctx: TabContext) => React.ReactNode>> = {
  overview: (c) => (
    <div className="d-flex flex-column gap-3">
      <SummaryTiles brandId={c.brandId || null} brandName={c.brandName} />
      <DistributionPanel brandId={c.brandId || null} brandName={c.brandName} />
      {/* The journey's own readiness and health, kept: they answer whether the
          machine is running, which Explorer's population figures do not. */}
      <OverviewTab />
    </div>
  ),
  campus: (c) => (
    <div className="d-flex flex-column gap-3">
      <CampusPanel brandId={c.brandId || null} brandName={c.brandName} />
      <OutreachPanel brandId={c.brandId || null} brandName={c.brandName} />
    </div>
  ),
  learners: (c) => <LearnersPanel brandId={c.brandId || null} brandName={c.brandName} />,
  decisions: (c) => <DecisionsPanel brandId={c.brandId || null} brandName={c.brandName} />,
  content: (c) => <ContentPanel brandId={c.brandId || null} brandName={c.brandName} />,
  shadow: (c) => <ShadowPanel brandId={c.brandId || null} brandName={c.brandName} />,
  'brand-setup': (c) => <BrandRolePanel brandId={c.brandId || null} brandName={c.brandName} />,

  /* ── The journey's own tabs, unchanged ──────────────────────────────────── */
  classification: (c) => (
    <ClassificationTab words={c.words} brandName={c.brandName} unseeded={c.unseeded} />
  ),
  handoffs: (c) => (
    <HandoffsTab words={c.words} brandName={c.brandName} unseeded={c.unseeded} />
  ),
  experiments: (c) => <ExperimentsTab brandId={c.brandId} />,
  performance: (c) => <PerformanceTab brandId={c.brandId} programId={c.programId} />,
  // The only writing tab among the journey's own. It takes the raw ids rather
  // than the resolved brand NAME, because a pause or a rollout names a scope by
  // uuid and a display name would be the wrong thing to put in a request body.
  controls: (c) => (
    <ControlsTab brandId={c.brandId} programId={c.programId} unseeded={c.unseeded} />
  ),
};
