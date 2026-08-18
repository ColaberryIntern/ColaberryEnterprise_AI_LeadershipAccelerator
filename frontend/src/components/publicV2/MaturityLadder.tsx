import React from 'react';
import { MATURITY_LEVELS } from '../../config/v2Maturity';
import './maturityLadder.css';

/**
 * MaturityLadder -- the five levels, drawn as a climb.
 *
 * The live site draws this as an SVG polyline with absolutely positioned dots.
 * This is CSS grid instead: a rotated track with the dots riding it, so the
 * climb is a property of the layout rather than a picture of one. It reflows on
 * a phone, scales with the type, and reads in order to a screen reader without
 * the diagram needing description.
 *
 * Dots and connector come from the same rotation, so they cannot drift apart --
 * the first version rotated the line independently of the dots and the fifth dot
 * ended up visibly off it.
 */
function MaturityLadder(): React.ReactElement {
  return (
    <div className="cbv2-ladder">
      <ol className="cbv2-ladder__row">
        {MATURITY_LEVELS.map((l) => (
          <li
            className="cbv2-ladder__step"
            key={l.n}
          >
            <span className="cbv2-ladder__dot" aria-hidden="true">
              {l.n}
            </span>
            <span className="cbv2-ladder__name">{l.name}</span>
          </li>
        ))}
      </ol>

      <ol className="cbv2-ladder__cards">
        {MATURITY_LEVELS.map((l) => (
          <li className="cbv2-ladder__card" key={l.n}>
            <span className="cbv2-ladder__n" aria-hidden="true">
              {l.n}
            </span>
            <h3 className="cbv2-ladder__title">{l.name}</h3>
            <p className="cbv2-ladder__what">{l.what}</p>
            <p className="cbv2-ladder__measures">
              <strong>Platform measures:</strong> {l.measures}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default MaturityLadder;
