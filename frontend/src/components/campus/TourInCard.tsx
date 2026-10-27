import React from 'react';
import { STATE_TAG } from './tourSteps';
import type { Tour } from './tourSteps';

/**
 * The guided tour inside the arrival panel (WP-2; the prototype's renderTourUI D:2783-2796): the stop card at the top of the panel
 * (numbered circle, the access tag for an Explorer, the tour's name, the title, what it is, "You can", the dashed tip), and the
 * nav row at its foot (End tour · dots · "Next: <building> →", or the finish). There is no Back and no separate end card, as in
 * the prototype. Off the route (the learner walked somewhere else mid-tour) the nav offers the way back to the current stop.
 */
const TAG_CLASS: Record<string, string> = { open: 'is-open', preview: 'is-preview', demo: 'is-demo', locked: 'is-lock' };

export function TourStopCard({ tour, index, onToday }: { tour: Tour; index: number; onToday?: () => void }): React.ReactElement | null {
  const stop = tour.stops[index];
  if (!stop) return null;
  // C53 (v13 T5): the Explorer tour's first stop is Today, so its block opens it
  // C77: every tour's first stop is the Schedule; from there, Today is the next step (Explorers and members alike)
  const todayStop = index === 0 && stop.buildingId === 'tower' && !!onToday;
  const explorer = tour.audience === 'explorer';
  return (
    <div className={`cm-tc${explorer ? ' is-explorer' : ''}`} data-testid="cm-tour" data-stop={index + 1}>
      <div className="cm-tc-k">
        <span className="cm-tc-n" aria-hidden="true">{index + 1}</span>
        {stop.state && <span className={`cm-tc-tag ${TAG_CLASS[stop.state]}`} data-testid="cm-tour-tag">{STATE_TAG[stop.state]}</span>}
        <span>{tour.name}</span>
      </div>
      <h3 className="cm-tc-t" data-testid="cm-tour-title">{stop.title}</h3>
      <p className="cm-tc-what">{stop.what}</p>
      {stop.note && <p className="cm-tc-note" data-testid="cm-tour-note">{stop.note}</p>}
      {stop.can.length > 0 && (
        <>
          <b className="cm-tc-can">{explorer && stop.state === 'locked' ? 'While you’re here' : 'You can'}</b>
          <ul>{stop.can.map((c) => <li key={c}>{c}</li>)}</ul>
        </>
      )}
      {stop.tip && <div className="cm-tc-tip" data-testid="cm-tour-tip"><span aria-hidden="true">💡 </span>{stop.tip}</div>}
      {todayStop && <button type="button" className="cm-btn-red cm-tc-today" onClick={onToday} data-testid="cm-tour-today">Open Today &rarr;</button>}
    </div>
  );
}

export interface TourNavProps {
  tour: Tour;
  index: number;
  /** The building whose panel this is: when it is not the current stop, the nav offers the way back to the tour. */
  hereStop: boolean;
  nextName: string | null;
  onNext: () => void;
  onBack: () => void;
  onEnd: () => void;
}
export function TourNav({ tour, index, hereStop, nextName, onNext, onBack, onEnd }: TourNavProps): React.ReactElement {
  const explorer = tour.audience === 'explorer';
  const cls = `cm-tn-go${explorer ? ' is-explorer' : tour.audience === 'business' ? ' is-partner' : ''}`;
  return (
    <div className="cm-tn" data-testid="cm-tour-nav">
      <button type="button" onClick={onEnd} data-testid="cm-tour-stop">End tour</button>
      {hereStop ? (
        <>
          <span className="cm-tn-dots" role="img" aria-label={`Stop ${index + 1} of ${tour.stops.length}`} data-testid="cm-tour-count">
            {tour.stops.map((s, i) => <i key={s.buildingId} className={i < index ? 'done' : i === index ? 'on' : ''} />)}
          </span>
          <button type="button" className={cls} onClick={onNext} data-testid="cm-tour-next">
            {nextName ? `Next: ${nextName} →` : explorer ? 'Finish · see what you’d unlock →' : 'Finish tour ✓'}
          </button>
        </>
      ) : (
        <button type="button" className={cls} onClick={onBack} data-testid="cm-tour-back-to">Back to the tour · stop {index + 1} →</button>
      )}
    </div>
  );
}
