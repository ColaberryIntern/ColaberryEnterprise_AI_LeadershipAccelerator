import React from 'react';
import type { PageSummary } from './interior/pageSummary';
import type { SpotDef } from './interior/roomSpots';
import { waysHeading } from './interior/roomSpots';
import './campusWays.css';

/**
 * The arrival card's two ways in (v6 D1, the prototype's waysHTML), under the tour block:
 *  - a room with a spot: "Look up, or sit down" (Admissions "…sit down with a person", the Game Room "…jump in"): a light tile,
 *    "📺 The board" (the section page, "The whole section: every card, in order"), and a dark tile named for the spot ("🪑 Your
 *    desk", "🎧 Your booth" …) with the card's title and the spot's line, doing what clicking the spot does;
 *  - a room without a spot: one tile, "On the board": the board's Next step and its action.
 */
export interface ArrivalWaysProps {
  spot: SpotDef | null;
  summary: PageSummary | null;
  /** The building's name (a section name when the page gives none) and its main action's label. */
  name: string;
  primaryLabel: string;
  onSection: () => void;
  onSpot: () => void;
}

export default function ArrivalWays({ spot, summary, name, primaryLabel, onSection, onSpot }: ArrivalWaysProps): React.ReactElement {
  const section = summary?.doorName ?? name;
  const next = summary?.next ?? null;
  if (!spot) {
    return (
      <section className="cm-ways" data-testid="cm-ways">
        <h3 className="cm-ways-h">On the board</h3>
        <div className="cm-ways-grid is-one">
          <button type="button" className="cm-way is-front" onClick={onSection} data-testid="cm-way-board">
            <span className="wk">📺 The board</span><b>{next?.title ?? section}</b>{next?.sub && <small>{next.sub}</small>}
            <span className="go">{next?.cta ?? primaryLabel} &rarr;</span>
          </button>
        </div>
      </section>
    );
  }
  const backTitle = spot.opens === 'order' ? 'Order food ↗' : spot.opens === 'book' ? 'Book a call with admissions' : spot.opens === 'page' ? primaryLabel : next?.title ?? `Open ${section}`;
  const backGo = spot.opens === 'order' ? 'Pick a craving' : spot.opens === 'book' ? 'Pick a time' : spot.opens === 'page' ? 'Step up' : 'Open the card';
  return (
    <section className="cm-ways" data-testid="cm-ways">
      <h3 className="cm-ways-h">{waysHeading(spot)}</h3>
      <div className="cm-ways-grid">
        <button type="button" className="cm-way is-front" onClick={onSection} data-testid="cm-way-board">
          {spot.opens === 'order' // C39: Chow Hall's screen is the craving grid, not a section
            ? <><span className="wk">📺 The screen</span><b>What are you craving?</b><small>Pizza, tacos, coffee and more</small><span className="go">Order food ↗</span></>
            : <><span className="wk">📺 The board</span><b>{section}</b><small>The whole section: every card, in order</small>
              <span className="go">See all of {section} &rarr;</span></>}
        </button>
        <button type="button" className="cm-way is-back" onClick={onSpot} data-testid="cm-way-spot">
          <span className="wk">{spot.tile}</span><b>{backTitle}</b><small>{spot.sub}</small>
          <span className="go">{backGo} &rarr;</span>
        </button>
      </div>
    </section>
  );
}
