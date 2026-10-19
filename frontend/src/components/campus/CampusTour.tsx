import React, { useEffect, useRef } from 'react';
import { STATE_TAG } from './tourSteps';
import type { Tour } from './tourSteps';
import { useCardFocus } from './useCardFocus';

/**
 * The guided tour card (Colaberry Campus C7), shown on the full map in place of the building card while the avatar walks from
 * stop to stop. Next / Back / End, "Stop n of N" and dots. Index === stops.length is the end card: the Explorer's end (the
 * opt-in and the sign-up sheet) is passed in; everyone else gets a plain "That's the tour".
 *
 * Focus moves to the stop heading on every step, so a keyboard or screen-reader user hears each stop. Esc is handled by the map
 * (CampusWorld): it ends the tour, not the map.
 */
export interface CampusTourProps {
  tour: Tour;
  index: number;
  onIndex: (i: number) => void;
  onEnd: () => void;
  explorerEnd?: React.ReactNode;
}

export default function CampusTour({ tour, index, onIndex, onEnd, explorerEnd }: CampusTourProps): React.ReactElement {
  const heading = useRef<HTMLHeadingElement | null>(null);
  useCardFocus(heading); // C11: when the tour ends, focus goes back to its opener, or to the map
  useEffect(() => { heading.current?.focus(); }, [index]);
  const n = tour.stops.length;
  const atEnd = index >= n;
  const stop = atEnd ? null : tour.stops[index];
  return (
    <section className="cm-card cm-tour" aria-labelledby="cm-tour-h" data-testid={atEnd ? 'cm-tour-end' : 'cm-tour'}>
      <div className="cm-tour-kick">{tour.name}</div>
      {stop ? (
        <>
          <div className="cm-tour-count" data-testid="cm-tour-count">Stop {index + 1} of {n}</div>
          <h2 id="cm-tour-h" className="cm-card-title" tabIndex={-1} ref={heading}>{stop.name}</h2>
          {stop.state && <span className={`cm-tour-tag is-${stop.state}`} data-testid="cm-tour-tag">{STATE_TAG[stop.state]}</span>}
          <p className="cm-tour-title">{stop.title}</p>
          <p className="cm-tour-what">{stop.what}</p>
          {stop.note && <p className="cm-who-note" data-testid="cm-tour-note">{stop.note}</p>}
          {stop.can.length > 0 && (
            <>
              <h3 className="cm-card-h">What you can do here</h3>
              <ul className="cm-tour-can">{stop.can.map((c) => <li key={c}>{c}</li>)}</ul>
            </>
          )}
          <p className="cm-tour-tip" data-testid="cm-tour-tip"><strong>Tip:</strong> {stop.tip}</p>
        </>
      ) : (
        <>
          <h2 id="cm-tour-h" className="cm-card-title" tabIndex={-1} ref={heading}>That's the tour</h2>
          {tour.audience === 'explorer' && explorerEnd
            ? explorerEnd
            : <p className="cm-tour-what">You have seen every stop. Pick any building on the map to go in.</p>}
        </>
      )}
      <div className="cm-tour-nav">
        <button type="button" className="cm-btn is-secondary" onClick={() => onIndex(index - 1)} disabled={index === 0} data-testid="cm-tour-back">Back</button>
        <span className="cm-tour-dots" aria-hidden="true">
          {tour.stops.map((s, i) => <i key={s.buildingId} className={i === index ? 'on' : i < index ? 'done' : ''} />)}
        </span>
        {atEnd
          ? <button type="button" className="cm-btn" onClick={onEnd} data-testid="cm-tour-done">Done</button>
          : <button type="button" className="cm-btn" onClick={() => onIndex(index + 1)} data-testid="cm-tour-next">{index === n - 1 ? 'Finish' : 'Next'}</button>}
      </div>
      {!atEnd && <button type="button" className="cm-link cm-tour-x" onClick={onEnd} data-testid="cm-tour-stop">End tour</button>}
    </section>
  );
}
