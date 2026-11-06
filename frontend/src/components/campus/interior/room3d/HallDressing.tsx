import React from 'react';
import './hallDressing.css';

/**
 * C118 (Ali 2026-11-06: "remove the window to the right and put something on the walls like big curtains or something that would
 * be in a real event hall"): the Events Hall's wall dressing, in the room's flat low-poly style.
 *  - StageDrapes, on the back wall: a gold-trimmed valance over the screen and a tall velvet leg either side of it, like a stage
 *    proscenium. The screen (5%..95% wide, from 5% down) is untouched; the legs fill the 5% margins.
 *  - HallCurtainWall, on the right wall in place of the window: a pelmet and two pairs of drawn-back velvet drapes with gold
 *    tie-backs, a brass sconce lit between each pair.
 * Pure CSS on a handful of DOM boxes (pleats are a repeating gradient, the drawn-back shape a clip-path): no images, no
 * downloads, no new dependency, decorative only (aria-hidden, no pointer events). Colors are art tokens (campusArtTokens.css).
 */
export function StageDrapes(): React.ReactElement {
  return (
    <div className="cm-hall-drapes" aria-hidden="true" data-testid="cm-hall-stage-drapes">
      <i className="leg is-left" />
      <i className="leg is-right" />
      <i className="valance" />
    </div>
  );
}

/** Two drawn-back pairs across the wall; each pair frames a lit sconce. */
const PAIRS = [0, 1] as const;

export function HallCurtainWall(): React.ReactElement {
  return (
    <div className="cm-hall-curtains" aria-hidden="true" data-testid="cm-hall-curtains">
      {PAIRS.map((n) => (
        <div key={n} className="pair" style={{ left: `${4 + n * 50}%` }}>
          <i className="drape is-left" /><i className="drape is-right" />
          <i className="tie is-left" /><i className="tie is-right" />
          <i className="sconce" />
        </div>
      ))}
      <i className="pelmet" />
    </div>
  );
}
