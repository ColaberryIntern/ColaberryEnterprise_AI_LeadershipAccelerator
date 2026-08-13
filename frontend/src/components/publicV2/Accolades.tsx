import React from 'react';
import { Claim, canShow } from './Claim';
import Icon, { IconName } from './Icon';
import { getClaim } from '../../config/claimsRegistry';
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
    label: 'a floor, not a total: only the ones who told us',
  },
  {
    claimKey: 'program.duration',
    icon: 'ladder',
    label: 'from AI Aware to a deployed build',
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

function Accolades(): React.ReactElement | null {
  const visible = ACCOLADE_TILES.filter((t) => {
    if (!canShow(t.claimKey)) return false;
    const c = getClaim(t.claimKey);
    // Skip rather than deform the row. See FIGURE_MAX.
    return Boolean(c && c.publicWording.length <= FIGURE_MAX);
  });
  if (!visible.length) return null;

  return (
    <div className="cbv2-accolades">
      {visible.map((t) => (
        <article className="cbv2-accolade" key={t.claimKey}>
          <span className="cbv2-accolade__icon" aria-hidden="true">
            <Icon name={t.icon} size={20} />
          </span>
          <p className="cbv2-accolade__figure">
            <Claim claimKey={t.claimKey} />
          </p>
          <p className="cbv2-accolade__label">{t.label}</p>
        </article>
      ))}
    </div>
  );
}

export default Accolades;
