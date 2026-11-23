import React from 'react';
import BrainTab from '../../explorerGrowth/BrainTab';
import GlobalScopeNotice from './GlobalScopeNotice';

/**
 * Maya's Brain, inside the Growth Journey workspace.
 *
 * ─── WHY THIS TAB EXISTS AT ALL ─────────────────────────────────────────────
 *
 * It was missing. The Explorer Growth merge ported Explorer's READ tabs and
 * deliberately left its write surfaces out, and because `/admin/explorer-growth`
 * now forwards here, that exclusion did not park the Brain - it removed it from
 * the product. Its backend routes stayed mounted and live the whole time with
 * nothing able to reach them.
 *
 * Ali, 2026-11-23: *"We are also missing the brain which is a very important
 * part."* He is right, and it is the most brand-relevant surface in Explorer:
 * Maya's voice, her never-say list, which shelves she draws from and how often
 * are what actually make her an Enrollment Specialist here and a Business
 * Development Specialist somewhere else. The role title shipped in `brand-setup`
 * is display copy by comparison.
 *
 * ─── IT REUSES EXPLORER'S TAB WHOLE, WHICH IS UNUSUAL HERE AND DELIBERATE ───
 *
 * Every other panel in this folder re-creates its fetching, because Explorer's
 * tab wrappers self-fetch from an UNSCOPED client and reusing one would bypass
 * brand scope. The Brain is the exception, for a reason rather than for
 * convenience: it answers on `/api/admin/maya-brain`, its own route tree, and
 * there is no brand-scoped version of it to bypass. Nothing is partitioned by
 * brand back there, so nothing can be served under the wrong brand's name.
 *
 * That is also why its client was split out to `mayaBrainApi.ts`: the Brain was
 * never Explorer Growth's, it was only ever in Explorer's client because
 * Explorer's page was the only thing rendering it. Two pages need it now, and one
 * definition beats two that can disagree.
 *
 * ─── WHAT THE NOTICE IS FOR, AND WHY IT IS NOT OPTIONAL ─────────────────────
 *
 * The rules persist through `setSetting(BRAIN_RULES_SETTING, ...)`: ONE system
 * setting shared by every brand. So saving here changes what Maya says
 * everywhere, and the inventory and the already-given list are Explorer's
 * population, which is Colaberry Training's.
 *
 * Under a brand selector, all of that reads as "this brand's". An operator who
 * picks Colaberry Enterprise, edits the voice and saves has just changed
 * Colaberry Training's outreach and been told nothing. The notice is the whole
 * defense until the rules are brand-keyed, which is storage work rather than a
 * client change.
 */

interface Props {
  /** Null when no brand is chosen, which is when there is nothing to mislead about. */
  brandId: string | null;
  brandName: string | null;
}

export default function BrainPanel({ brandId, brandName }: Props) {
  return (
    <>
      <GlobalScopeNotice what="Maya's brain" brandName={brandId ? brandName : null}>
        Her voice, never-say list, shelf rotation and cadence are stored as one setting shared
        by every brand, so <strong>saving here changes what she says everywhere</strong>. The
        inventory and the already-given list below come from Explorer Growth&rsquo;s population,
        which is Colaberry Training&rsquo;s. Per-brand rules are the next piece of work; nothing
        on this tab is filtered by brand today.
      </GlobalScopeNotice>

      {/* Explorer's tab, unmodified. Writing a second one would be a second set of
          rules to keep in step, on the surface that decides what Maya says. */}
      <BrainTab />
    </>
  );
}
