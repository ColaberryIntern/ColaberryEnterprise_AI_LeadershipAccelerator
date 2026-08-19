import React from 'react';
import { canShow } from './Claim';
import Icon, { IconName } from './Icon';
import { getClaim } from '../../config/claimsRegistry';
import useCountUp from './useCountUp';
import './accolades.css';

/**
 * Accolades -- the "built for outcomes" band from the live site, governed.
 *
 * WHY THIS IS NOT JUST FOUR HARDCODED TILES
 * On the live site this band reads: "5,000+ careers launched", "Since 2012",
 * "12 wks", "CCA-F", under the subhead "an Anthropic-partner curriculum". Three
 * of those five are registry-blocked:
 *
 *   - `trackrecord.careers`  still blocked, but now for a measured reason: CCPP
 *     shows 8,588 enrolled, 2,844 certified and 691 hired, so "5,000+ careers
 *     launched" overstates the outcome even though it understates enrolment.
 *     Superseded by `trackrecord.students` and `trackrecord.certified`, which
 *     carry their counting method in the wording.
 *   - `trackrecord.since2012` is now VERIFIED: the earliest class StartDate in
 *     CCPP is 2012-04-07, with enrolments in every year through 2026.
 *   - `credential.cca`       blocked; the safe wording is certification
 *     PREPARATION with the credential issued by the certifying body.
 *   - the partner designation is blocked outright.
 *
 * So each tile is declared with a claim key and renders only if that claim is
 * currently publishable. The moment someone records the evidence, the tile
 * appears with no code change. Until then the band shows what is true, which is
 * a shorter but defensible list.
 *
 * `WITHHELD` is exported so the Proof Room can state how many accolades are
 * being held back and why, rather than the absence being invisible.
 */

export interface AccoladeTile {
  readonly claimKey: string;
  readonly icon: IconName;
  /** Shown under the figure. Never itself a claim. */
  readonly label: string;
}

/*
 * FIGURES ONLY. Every claim here must be a short figure, because the tile sets
 * it at display size.
 *
 * The first version also listed `credential.cca.safe` and `anthropic.capability`
 * -- both correct claims, both full sentences. Rendered at 2rem they became
 * walls of type that blew the tile heights out and wrecked the row. Those two
 * belong in the card section above, where they already are, and `FIGURE_MAX`
 * below stops the same mistake being repeated.
 *
 * `trackrecord.since2012` is also gone: "8,588 students since 2012" already
 * carries the year, so a separate "since 2012" tile said it twice.
 */
export const ACCOLADE_TILES: readonly AccoladeTile[] = [
  {
    claimKey: 'trackrecord.students',
    icon: 'people',
    label: 'enrolled in a class, counted from our own records',
  },
  { claimKey: 'trackrecord.certified', icon: 'shieldCheck', label: 'completed and certified' },
  {
    claimKey: 'trackrecord.hired',
    icon: 'trend',
    // 691 are traceable in CCPP; the published figure includes ~300 further
    // hires Ali knows of that were never reported back. The label says which
    // kind of number this is rather than implying a query produced it.
    label: 'tracked hires plus those we know of, reported and unreported',
  },
  {
    // Was the 12-week programme length. Ali swapped it for company tenure: three
    // outcome figures followed by a duration read as a fourth outcome, and the
    // years behind the work say more here than the length of the path does.
    claimKey: 'company.tenure',
    icon: 'ladder',
    // Carries the words the figure gave up so the pair still reads as the whole
    // claim. NOT "since 2012": that exact claim is on the homepage's blocked
    // list, and writing it in lower case to slip past a string match would be
    // gaming the ban rather than honouring it.
    label: 'of consulting and training delivery',
  },
];

/**
 * A tile renders a figure, not a paragraph. Anything longer than this is a
 * sentence that belongs in prose, and rendering it here would break the row
 * rather than merely look odd.
 */
export const FIGURE_MAX = 44;

/** Accolades that exist but cannot ship yet, with the reason. */
export function withheldAccolades(): { key: string; why: string }[] {
  return ACCOLADE_TILES.filter((t) => !canShow(t.claimKey))
    .map((t) => {
      const c = getClaim(t.claimKey);
      return {
        key: t.claimKey,
        why: c ? `${c.verification} — ${c.evidenceSource}` : 'unknown claim',
      };
    });
}

/**
 * One tile. Split out because each needs its own count-up hook, and hooks
 * cannot be called inside a .map callback in the parent.
 *
 * THE ACCESSIBILITY RULE HERE IS A GOVERNANCE RULE. The animated digits are
 * aria-hidden and the true registry wording is exposed to assistive tech in a
 * visually-hidden span. A screen reader announcing "437 hires" on its way to
 * 1,000 would be reading a claim we never made out loud. Once the count
 * settles the two are identical, so nothing is lost.
 */
function AccoladeTileView({ tile, wording }: { tile: AccoladeTile; wording: string }): React.ReactElement {
  const { ref, display, settled } = useCountUp(wording);

  return (
    <article className="cbv2-accolade">
      <span className="cbv2-accolade__icon" aria-hidden="true">
        <Icon name={tile.icon} size={20} />
      </span>
      <p className="cbv2-accolade__figure" ref={ref as React.RefObject<HTMLParagraphElement>}>
        {/* Real value, always correct, always available to assistive tech. */}
        <span className="cbv2-sr-only">{wording}</span>
        <span aria-hidden={!settled} data-settled={settled}>
          {display}
        </span>
      </p>
      <p className="cbv2-accolade__label">{tile.label}</p>
    </article>
  );
}

function Accolades(): React.ReactElement | null {
  const visible = ACCOLADE_TILES.map((t) => ({ tile: t, claim: getClaim(t.claimKey) }))
    .filter(({ tile, claim }) => {
      if (!canShow(tile.claimKey)) return false;
      // Skip rather than deform the row. See FIGURE_MAX.
      return Boolean(claim && claim.publicWording.length <= FIGURE_MAX);
    });
  if (!visible.length) return null;

  return (
    <div className="cbv2-accolades">
      {visible.map(({ tile, claim }) => (
        <AccoladeTileView key={tile.claimKey} tile={tile} wording={claim!.publicWording} />
      ))}
    </div>
  );
}

export default Accolades;
