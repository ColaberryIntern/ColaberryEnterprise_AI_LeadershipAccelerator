import React from 'react';
import { ReactComponent as StaffedSystem } from './heroSystemDiagram.svg';

/**
 * The hero diagram: Ali's staffed-system drawing.
 *
 * Imported as a COMPONENT rather than an <img> so the animation can drive the
 * actual elements -- 10 boxes, 13 connectors, 12 nodes. An <img> could only ever
 * fade as a whole, and the structure is the thing worth animating.
 *
 * NO SCROLL OBSERVER, DELIBERATELY. The first version revealed the drawing once
 * when it entered the viewport. The hero is above the fold, so that reveal
 * finished before a reader had focused on it and the drawing appeared static.
 * The motion is now continuous and lives entirely in CSS (see heroV7.css), which
 * means there is no state to hold here and nothing to observe -- and it keeps
 * running for a reader who scrolls back up to it.
 *
 * The whole figure is aria-hidden. Every label in it -- system, people, one
 * platform -- restates a word already in the headline and body text beside it,
 * so announcing it would read the same claim twice.
 */
export default function HeroDiagram(): React.ReactElement {
  return (
    <div className="cbv2-h7dia" aria-hidden="true">
      <StaffedSystem />
    </div>
  );
}
