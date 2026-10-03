import React from 'react';
import OverviewTab from './OverviewTab';
import ClassificationTab from './ClassificationTab';
import DecisionsTab from './DecisionsTab';
import ShadowTab from './ShadowTab';
import ContentTab from './ContentTab';
import HandoffsTab from './HandoffsTab';
import ExperimentsTab from './ExperimentsTab';
import PerformanceTab from './PerformanceTab';
import ControlsTab from './ControlsTab';
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

export const TAB_VIEWS: Partial<Record<TabKey, (ctx: TabContext) => React.ReactNode>> = {
  overview: () => <OverviewTab />,
  classification: (c) => (
    <ClassificationTab words={c.words} brandName={c.brandName} unseeded={c.unseeded} />
  ),
  decisions: (c) => (
    <DecisionsTab
      words={c.words}
      brandName={c.brandName}
      unseeded={c.unseeded}
      programId={c.programId}
    />
  ),
  shadow: () => <ShadowTab />,
  content: (c) => <ContentTab brandName={c.brandName} unseeded={c.unseeded} />,
  handoffs: (c) => (
    <HandoffsTab words={c.words} brandName={c.brandName} unseeded={c.unseeded} />
  ),
  experiments: (c) => <ExperimentsTab brandId={c.brandId} />,
  performance: (c) => <PerformanceTab brandId={c.brandId} programId={c.programId} />,
  // The only writing tab. It takes the raw ids rather than the resolved brand NAME,
  // because a pause or a rollout names a scope by uuid and a display name would be
  // the wrong thing to put in a request body.
  controls: (c) => (
    <ControlsTab brandId={c.brandId} programId={c.programId} unseeded={c.unseeded} />
  ),
};
