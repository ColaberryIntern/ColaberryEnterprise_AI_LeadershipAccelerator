import React from 'react';
import { Body as SettingsBody } from '../../explorerGrowth/SettingsTab';
import GlobalScopeNotice from './GlobalScopeNotice';
import ScopeState from './ScopeState';
import { useGrowthJourneyData } from '../useGrowthJourneyData';
import { getExplorerSummary } from '../../../services/growthJourneyExplorerApi';

/**
 * The operating mode, and an honest account of what is not here.
 *
 * ─── RESTORED ALONGSIDE THE BRAIN, FOR THE SAME REASON ──────────────────────
 *
 * Both tabs were left out of the Explorer Growth merge as "write surfaces", and
 * because `/admin/explorer-growth` now forwards here, leaving them out removed
 * them from the product rather than parking them.
 *
 * Settings turns out not to be a write surface at all. `SettingsTab`'s own
 * header records why: the mode dropdown in the §26 mockup is **deliberately
 * absent**, because its upper values are what would let this system email real
 * learners, and that is a decision to be taken rather than a widget to click.
 * So this tab reads, and the governance boundary stays where it was.
 *
 * ─── IT REUSES EXPLORER'S `Body`, WHICH IS PURE ─────────────────────────────
 *
 * `SettingsTab` takes a whole `AsyncState` and hands it to `AsyncPanel`, so the
 * wrapper cannot be reused here - this page draws scope states, not async
 * states, and a 403 through `AsyncPanel` renders as a red failure rather than
 * the configuration step it actually is. But `SettingsTab` exports `Body`,
 * already pure and already taking the summary as a prop, precisely so the mode
 * logic is testable without an async shell. So the fetching is re-created and
 * the rendering is Explorer's, the same split `DistributionPanel` uses.
 *
 * ─── THIS PANEL IS HALF SCOPED AND HALF GLOBAL, AND SAYS SO ─────────────────
 *
 * The mode comes from the summary, which is read through the brand-scoped route,
 * so it narrows like every other tab. Underneath it `Body` renders Explorer's
 * `ControlsCard`, which self-fetches `getControls()` from the unscoped client:
 * those are system-wide switches, one set for the whole of Explorer Growth.
 *
 * Mixed scope on one screen is exactly the thing a reader gets wrong, so the
 * notice names which half is which rather than leaving it to be inferred.
 *
 * ─── WHY AN EMPTY MODE FOR ANOTHER BRAND IS CORRECT, NOT BROKEN ─────────────
 *
 * Selecting a brand that is not Colaberry Training shows no mode. That is not a
 * gap: Explorer Growth IS the Colaberry Training learner journey, so no other
 * brand has an Explorer run to have a mode. "No run" and "we cannot show you"
 * are different facts and `ScopeState` says which.
 */

interface Props {
  brandId: string | null;
  brandName: string | null;
}

export default function SettingsPanel({ brandId, brandName }: Props) {
  const summary = useGrowthJourneyData(
    () => getExplorerSummary(brandId),
    `explorer-settings-summary:${brandId ?? 'all'}`
  );

  return (
    <>
      <GlobalScopeNotice what="Part of this tab" brandName={brandId ? brandName : null}>
        The operating mode below is read for the selected brand. The controls beneath it are
        Explorer Growth&rsquo;s own system-wide switches, <strong>one set for everything</strong>,
        not one per brand. Nothing on this tab can change what sends: the mode switch is
        deliberately absent, because its upper values are what would let the system email real
        learners.
      </GlobalScopeNotice>

      <ScopeState
        state={summary}
        brandSelected={brandId !== null}
        brandName={brandName}
        onRetry={summary.reload}
      >
        {(s) => <SettingsBody summary={s} />}
      </ScopeState>
    </>
  );
}
