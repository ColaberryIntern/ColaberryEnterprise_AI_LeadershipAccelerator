import React from 'react';
import { Claim, canShow } from './Claim';
import { ROADMAP_PHASES, ROADMAP_LANES, ROADMAP_WEEKS, ROADMAP_OUTCOME } from '../../config/v2Roadmap';
import './roadmap12.css';

/**
 * Roadmap12 -- the twelve-week path, drawn as a grid rather than as artwork.
 *
 * Every element is placed by grid-column from the week numbers in config, so the
 * phases, the week markers and the two lanes cannot drift out of alignment with
 * each other. That is the lesson from the maturity ladder, where a hand-set
 * rotation and padding-driven dots agreed at the left and had visibly separated
 * by the right-hand end.
 *
 * The credential at the end is named through the registry, so the blocked
 * designation cannot reappear here by someone typing it into markup.
 */
function Roadmap12(): React.ReactElement {
  const cols = { gridTemplateColumns: `repeat(${ROADMAP_WEEKS}, minmax(0, 1fr))` };

  return (
    <div className="cbv2-rm">
      {/* Phase bands, each spanning its own weeks. */}
      <ol className="cbv2-rm__phases" style={cols} aria-label="Programme phases">
        {ROADMAP_PHASES.map((p) => (
          <li
            className="cbv2-rm__phase"
            key={p.n}
            style={{ gridColumn: `${p.from} / ${p.to + 1}` }}
          >
            <span className="cbv2-rm__phase-n">{p.n}</span>
            <span className="cbv2-rm__phase-t">{p.title}</span>
          </li>
        ))}
      </ol>

      {/* The weeks themselves. */}
      <ol className="cbv2-rm__weeks" style={cols} aria-label="Twelve weeks">
        {Array.from({ length: ROADMAP_WEEKS }, (_, i) => i + 1).map((w) => (
          <li className="cbv2-rm__week" key={w}>
            <span className="cbv2-rm__dot" aria-hidden="true" />
            <span className="cbv2-rm__wk">W{w}</span>
          </li>
        ))}
      </ol>

      {/* Lanes that open partway through, which is the point of the diagram. */}
      <div className="cbv2-rm__lanes" style={cols}>
        {ROADMAP_LANES.map((l) => (
          <div
            className={`cbv2-rm__lane cbv2-rm__lane--${l.key}`}
            key={l.key}
            style={{ gridColumn: `${l.startsWeek} / ${ROADMAP_WEEKS + 1}` }}
          >
            <span className="cbv2-rm__lane-label">
              {l.label} &middot; starts week {l.startsWeek}
            </span>
          </div>
        ))}
      </div>

      <div className="cbv2-rm__legend">
        {ROADMAP_LANES.map((l) => (
          <p className="cbv2-rm__legend-item" key={l.key}>
            <span className={`cbv2-rm__swatch cbv2-rm__swatch--${l.key}`} aria-hidden="true" />
            <span>
              <strong>{l.label}</strong> {l.detail}
            </span>
          </p>
        ))}
      </div>

      <div className="cbv2-rm__end">
        <h3 className="cbv2-rm__end-title">{ROADMAP_OUTCOME.title}</h3>
        <ul className="cbv2-rm__end-list">
          {ROADMAP_OUTCOME.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
        {/* Named through the registry: certification PREPARATION, credential
            issued by the certifying body. The live site prints the blocked
            designation here instead. */}
        {canShow('credential.cca.safe') ? (
          <p className="cbv2-rm__cred">
            <Claim claimKey="credential.cca.safe" />
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default Roadmap12;
