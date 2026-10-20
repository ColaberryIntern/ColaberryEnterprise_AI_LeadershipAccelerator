import React, { memo } from 'react';
import type { CampusPerson } from './campusApi';
import type { CampusBuilding } from './campusMap';
import { initialsOf } from './WhoIsHere';
import { GearOnHead } from './AvatarGear';
import { publicOnly } from './campusGear';
import { rungTone } from '../../services/bandLadder';
import '../../styles/rungTones.css';

/**
 * The named people beside a building on the full campus map (Colaberry Campus C5).
 *
 * NO GENERATED FACES: a photo only when the learner uploaded one (avatar_url), clipped to a circle; otherwise their
 * initials. At most `shown.length` tokens (the caller caps it) plus a "+N" when more are here. Each token is a
 * keyboard-reachable button that opens that person's card.
 */
export interface PersonTokensProps {
  b: CampusBuilding;
  shown: CampusPerson[];
  more: number;
  onPick: (p: CampusPerson) => void;
  /** The map's bottom edge (passed in, so this file never imports the map: no import cycle). */
  maxY: number;
}

const R = 11;
/** C11: the tap/click target (a transparent circle), at least 24 px across at the map's usual scale; tokens are spaced so targets never overlap. */
export const TOKEN_HIT_R = 16;
const GAP = TOKEN_HIT_R * 2 + 2;

function PersonTokens({ b, shown, more, onPick, maxY }: PersonTokensProps): React.ReactElement | null {
  if (!shown.length) return null;
  // A centered row UNDER the building's name pill (C11b: pos.y is the ground line, the pill sits 12..32 below it), clear of
  // the roof and the head-count chip up top. Kept inside the world's bottom edge.
  const { x, y } = b.pos;
  const n = shown.length + (more > 0 ? 1 : 0);
  const x0 = x - ((n - 1) * GAP) / 2;
  const y0 = Math.min(y + 50, maxY - R - 4);
  return (
    <g className="cm-tokens" data-testid={`cm-tokens-${b.id}`}>
      {shown.map((p, i) => {
        const cx = x0 + i * GAP, clip = `cm-tok-${b.id}-${i}`;
        const pick = () => onPick(p);
        return (
          <g key={p.enrollment_id} className="cm-token" role="button" tabIndex={0} aria-label={`${p.display_name}${p.rung_name ? `, ${p.rung_name}` : ''}, open their card`}
            data-enrollment={p.enrollment_id} onClick={(e) => { e.stopPropagation(); pick(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); pick(); } }}>
            <circle className="cm-token-hit" cx={cx} cy={y0} r={TOKEN_HIT_R} />
            {/* C11: focus gets its OWN ring outside the level ring; the level ring's inline stroke can never hide it. */}
            <circle className="cm-token-focus" cx={cx} cy={y0} r={R + 6} data-testid="cm-token-focus" />
            {/* C9: the ring takes the level's tone (the portal's rung colors); the rung is in the label and on the card. */}
            {p.rung_name
              ? <circle className={`cm-token-ring is-level rung-${rungTone(p.rung_name)}`} style={{ stroke: 'var(--rung-solid)' }} cx={cx} cy={y0} r={R + 2} data-rung={p.rung_name} />
              : <circle className="cm-token-ring" cx={cx} cy={y0} r={R + 2} />}
            {p.avatar_url ? (
              <>
                <clipPath id={clip}><circle cx={cx} cy={y0} r={R} /></clipPath>
                <image href={p.avatar_url} x={cx - R} y={y0 - R} width={R * 2} height={R * 2} clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
              </>
            ) : (
              <>
                <circle className="cm-token-face" cx={cx} cy={y0} r={R} />
                <text className="cm-token-initials" x={cx} y={y0 + 4} textAnchor="middle">{initialsOf(p.display_name)}</text>
              </>
            )}
            {/* Tokens are 11 px: only the head item fits without covering the initials; the card lists everything worn. */}
            <GearOnHead gear={{ head: publicOnly(p.gear).head }} cx={cx} cy={y0} r={R} />
          </g>
        );
      })}
      {more > 0 && <text className="cm-token-more" x={x0 + shown.length * GAP} y={y0 + 4} textAnchor="middle" data-testid={`cm-tokens-more-${b.id}`}>+{more}</text>}
    </g>
  );
}

// C11: memoized (the map stays light); the map passes one stable onPick per building.
export default memo(PersonTokens);
