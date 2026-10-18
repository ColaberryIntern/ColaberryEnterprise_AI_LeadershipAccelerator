import React from 'react';
import type { CampusPerson } from './campusApi';
import type { CampusBuilding } from './campusMap';
import { initialsOf } from './WhoIsHere';

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
const GAP = 24;

export default function PersonTokens({ b, shown, more, onPick, maxY }: PersonTokensProps): React.ReactElement | null {
  if (!shown.length) return null;
  // A centered row UNDER the building's name, clear of the roof and the head-count chip (both sit up top; tokens beside
  // the roof covered the chip in the first screenshots). Kept inside the world's bottom edge.
  const { x, y, h } = b.pos;
  const n = shown.length + (more > 0 ? 1 : 0);
  const x0 = x - ((n - 1) * GAP) / 2;
  const y0 = Math.min(y + h / 2 + 44, maxY - R - 4);
  return (
    <g className="cm-tokens" data-testid={`cm-tokens-${b.id}`}>
      {shown.map((p, i) => {
        const cx = x0 + i * GAP, clip = `cm-tok-${b.id}-${i}`;
        const pick = () => onPick(p);
        return (
          <g key={p.enrollment_id} className="cm-token" role="button" tabIndex={0} aria-label={`${p.display_name}, open their card`}
            data-enrollment={p.enrollment_id} onClick={(e) => { e.stopPropagation(); pick(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); pick(); } }}>
            <circle className="cm-token-ring" cx={cx} cy={y0} r={R + 2} />
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
          </g>
        );
      })}
      {more > 0 && <text className="cm-token-more" x={x0 + shown.length * GAP} y={y0 + 4} textAnchor="middle" data-testid={`cm-tokens-more-${b.id}`}>+{more}</text>}
    </g>
  );
}
