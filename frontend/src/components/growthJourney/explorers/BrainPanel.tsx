import React from 'react';
import BrainTab from '../../explorerGrowth/BrainTab';
import GlobalScopeNotice from './GlobalScopeNotice';

/**
 * Maya's Brain, inside the Growth Journey workspace, scoped by brand.
 *
 * ─── WHY THIS TAB EXISTS ────────────────────────────────────────────────────
 *
 * It was missing. The Explorer Growth merge ported Explorer's READ tabs and left
 * its write surfaces out, and because `/admin/explorer-growth` now forwards
 * here, that exclusion did not park the Brain - it removed it from the product.
 * Its backend routes stayed mounted and live the whole time with nothing able to
 * reach them. Ali, 2026-11-23: *"We are also missing the brain which is a very
 * important part."*
 *
 * He was right, and it is the most brand-relevant surface in Explorer: Maya's
 * voice, her never-say list, which shelves she draws from and how often are what
 * actually make her an Enrollment Specialist here and a Business Development
 * Specialist somewhere else. The role title in `brand-setup` is display copy by
 * comparison.
 *
 * ─── THE RULES NOW FOLLOW THE BRAND. THE REST STILL DOES NOT. ───────────────
 *
 * When this tab first shipped, every rule was one setting shared by everybody,
 * and the notice said so because nothing in code could stop an operator editing
 * Enterprise's voice and rewriting Training's. That is fixed: the rules are
 * keyed by brand, a brand with none falls back to the shared set, and a save
 * writes that brand's key alone.
 *
 * Two things on this tab are still NOT brand-scoped, and conflating them is
 * exactly the misreading this workstream exists to prevent:
 *
 * - **The inventory** - what each shelf can choose from - is one library.
 * - **The already-given list** is Explorer's population, which is Colaberry
 *   Training's. Under an Enterprise selector those are still Training's people.
 *
 * So the notice did not go away when the rules became per-brand; it changed to
 * name the half that still does not follow the selector. A notice removed the
 * moment part of the problem was fixed is how the other half gets forgotten.
 *
 * ─── IT REUSES EXPLORER'S TAB WHOLE ─────────────────────────────────────────
 *
 * Every other panel here re-creates its fetching, because Explorer's wrappers
 * self-fetch from an unscoped client. The Brain is the exception, deliberately:
 * it answers on `/api/admin/maya-brain`, its own route tree, and that route now
 * takes an optional brand. `BrainTab` takes an optional `brandId` that defaults
 * to null, so Explorer's own page - which renders `<BrainTab />` with no props -
 * keeps reading the shared set and was not edited at all.
 */

interface Props {
  /** Null when no brand is chosen, which means the shared rule set. */
  brandId: string | null;
  brandName: string | null;
}

export default function BrainPanel({ brandId, brandName }: Props) {
  return (
    <>
      <GlobalScopeNotice what="Part of this tab" brandName={brandId ? brandName : null}>
        {brandId ? (
          <>
            <strong>Maya&rsquo;s rules below are this brand&rsquo;s.</strong> Saving writes only
            this brand; no other brand changes. If this brand has none of its own yet, the shared
            set is shown and the panel says so, and saving creates this brand&rsquo;s own from it.
            What is <em>not</em> brand-scoped is underneath: the shelf inventory is one library,
            and the already-given list is Explorer Growth&rsquo;s population, which is Colaberry
            Training&rsquo;s.
          </>
        ) : (
          <>
            <strong>These are the shared rules</strong>, used by every brand that has not set its
            own, so saving here changes what Maya says on all of them. To edit one brand only,
            choose it in the selector above. The inventory and the already-given list are one
            library and one population either way.
          </>
        )}
      </GlobalScopeNotice>

      {/* Explorer's tab, given the selected brand. Writing a second one would be
          a second set of rules to keep in step, on the surface that decides what
          Maya says. */}
      <BrainTab brandId={brandId} />
    </>
  );
}
