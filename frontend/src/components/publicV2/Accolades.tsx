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
 *   - `trackrecord.careers`  NEEDS_VERIFICATION. No source located, and it
 *     conflicts with a "10,000+ trained" claim elsewhere in the same codebase.
 *   - `trackrecord.since2012` NEEDS_VERIFICATION against incorporation records.
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

export const ACCOLADE_TILES: readonly AccoladeTile[] = [
  {
    claimKey: 'program.duration',
    icon: 'ladder',
    label: 'from AI Aware to a deployed build',
  },
  {
    claimKey: 'credential.cca.safe',
    icon: 'medal',
    label: 'what builders prepare for',
  },
  {
    claimKey: 'anthropic.capability',
    icon: 'cpu',
    label: 'the models the work is built on',
  },
  { claimKey: 'trackrecord.careers', icon: 'people', label: 'careers launched' },
  { claimKey: 'trackrecord.since2012', icon: 'clipboard', label: 'building in data and AI' },
];

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
  const visible = ACCOLADE_TILES.filter((t) => canShow(t.claimKey));
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
