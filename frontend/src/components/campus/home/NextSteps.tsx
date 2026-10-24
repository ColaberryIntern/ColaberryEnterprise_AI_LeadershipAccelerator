import React from 'react';
import type { BuildingId, CampusAudience, CampusBuilding } from '../campusMap';
import { buildingName } from '../campusMap';
import type { PlanStop } from '../campusPlan';
import { canComplete } from '../campusPlan';
import type { CompleteResult } from '../campusPlanApi';
import '../campusHome.css'; // the panel's card styles, shared by the page rail (all selectors are cm- scoped)

/**
 * WP-1 (owner rule: there is always a side panel with your next steps and the tours). The three pieces the campus home's side panel
 * and every page's rail share, so a step or the tour's state can never read differently in the two:
 *  - UpNext: the next unfinished step of today's plan: Walk there + Open now, or in its building Open the card + Mark done (C15);
 *  - RoomsHere: the rooms of the building you are in (C15: replaced HereAt, which repeated Up next);
 *  - TourOffer: the tour card in its three states (the prototype's renderAcctCard): offer, in progress / Resume, and taken.
 * Real data only: steps come from today's plan, stop counts from the viewer's own tour; a piece with nothing true to say is not drawn.
 */

/** "about N min": the prototype's 3-minute walk is about 20 seconds a stop. */
export const tourMinutes = (stops: number): number => Math.max(1, Math.ceil(stops / 3));

export interface UpNextProps {
  stops: PlanStop[] | null;
  buildings: CampusBuilding[];
  workplaceNames: boolean;
  hereId: BuildingId | null;
  onWalk: (id: BuildingId) => void;
  onOpen: (route: string) => void;
  /** C15: Mark done (in the step's building), the same path as the arrival card's: points burst, "Next: … [Go]", plan pins. */
  onDone?: (stop: PlanStop) => Promise<CompleteResult>;
}
export function UpNext({ stops, buildings, workplaceNames, hereId, onWalk, onOpen, onDone }: UpNextProps): React.ReactElement | null {
  const [busy, setBusy] = React.useState(false);
  const [why, setWhy] = React.useState<string | null>(null);
  const i = stops ? stops.findIndex((s) => !s.done) : -1;
  if (!stops || i < 0) return null;
  const s = stops[i];
  const b = s.buildingId ? buildings.find((x) => x.id === s.buildingId) : undefined;
  const at = !!b && b.id === hereId;
  return (
    <section className="cm-upnext" aria-label="Up next" data-testid="cm-up-next">
      <div className="cm-sec">Up next</div>
      <div className="cm-next-row">
        <span className="cm-pl-n" aria-hidden="true">{i + 1}</span>
        <span className="cm-next-t"><b data-testid="cm-up-next-title">{s.title}</b><small>Step {i + 1} of {stops.length}{b ? ` · ${buildingName(b, workplaceNames)}` : ''}</small></span>
        {/* C13: the title wraps (two lines at most) and the buttons sit on their own row, so nothing covers it */}
        {/* C15 (v3 2.6): away from its building "Walk there →" + "Open now"; in it "Open the card →" + "Mark done" */}
        <span className="cm-upnext-actions">
          {b && !at ? (
            <>
              <button type="button" className="cm-btn-red" onClick={() => onWalk(b.id)} data-testid="cm-up-next-go">Walk there &rarr;</button>
              <button type="button" className="cm-btn-line" onClick={() => onOpen(s.route)} data-testid="cm-up-next-now">Open now</button>
            </>
          ) : (
            <>
              <button type="button" className="cm-btn-red" onClick={() => onOpen(s.route)} data-testid="cm-up-next-open">Open the card &rarr;</button>
              {onDone && canComplete(s) && (
                <button type="button" className="cm-btn-line" disabled={busy} data-testid="cm-up-next-done"
                  onClick={async () => { setBusy(true); setWhy(null); const r = await onDone(s); setBusy(false); if (!r.ok) setWhy(r.message); }}>
                  {busy ? 'Marking…' : 'Mark done'}
                </button>
              )}
            </>
          )}
        </span>
      </div>
      {why && <p className="cm-pb-why" role="alert" data-testid="cm-up-next-why">{why}</p>}
    </section>
  );
}

/**
 * C15 (v3 2.6): "Rooms in the <building>", only while you are in one: the building's rooms (a room whose page does not exist yet is
 * left out), each opening through the door. Replaces "Here at …", which repeated Up next.
 */
export function RoomsHere({ building: b, workplaceNames, onOpen }: { building: CampusBuilding | null; workplaceNames: boolean; onOpen: (route: string) => void }): React.ReactElement | null {
  if (!b) return null;
  const rooms = b.rooms.filter((r) => !r.planned); // the Main Gate has no live rooms, so nothing shows there
  if (!rooms.length) return null;
  return (
    <section className="cm-rooms-here" aria-label={`Rooms in the ${buildingName(b, workplaceNames)}`} data-testid="cm-rooms-here">
      <div className="cm-sec">Rooms in the {buildingName(b, workplaceNames)}</div>
      <div className="cm-chips">
        {rooms.map((r) => (
          <button key={r.route} type="button" onClick={() => onOpen(r.route)} data-testid="cm-rooms-here-room">
            {workplaceNames && r.workplaceLabel ? r.workplaceLabel : r.label} <span aria-hidden="true">&rarr;</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export interface TourOfferProps {
  audience: CampusAudience;
  /** The viewer's tour, or null (staff have none). */
  stops: { buildingId: BuildingId }[] | null;
  buildings: CampusBuilding[];
  workplaceNames: boolean;
  /** The stop on screen while the tour runs, else null. */
  running: number | null;
  paused: number | null;
  toured: boolean;
  onStart: (from: number) => void;
  onEnd?: () => void;
  /** C13: × on a paused tour. */
  onDismiss?: () => void;
}
export function TourOffer(p: TourOfferProps): React.ReactElement | null {
  if (!p.stops || !p.stops.length) return null;
  const n = p.stops.length;
  const name = (i: number) => { const b = p.buildings.find((x) => x.id === p.stops![Math.min(i, n - 1)].buildingId); return b ? buildingName(b, p.workplaceNames) : ''; };
  const partner = p.audience === 'business';
  const cls = partner ? 'cm-partner-tour cm-tour-offer' : 'cm-sg cm-tour-offer';
  // C13: a tour left on its LAST stop counts as finished: never "Stop N of N" with Resume.
  const lastLeft = p.running === null && p.paused !== null && p.paused >= n - 1;
  const at = p.running ?? (p.paused !== null && p.paused < n - 1 ? p.paused : null);
  const state = p.running !== null ? 'running' : at !== null ? 'paused' : p.toured || lastLeft ? 'done' : 'idle';
  const btn = partner ? 'cm-btn-white' : 'cm-btn-red';
  if (state === 'running' || state === 'paused') {
    return (
      <div className={cls} data-testid="cm-cc-tour" data-state={state}>
        <div style={{ flex: 1 }}><div className="t">🧭 Tour in progress</div><div className="d">Stop {at! + 1} of {n} &middot; {name(at!)}</div></div>
        {state === 'paused'
          ? <button type="button" className={btn} onClick={() => p.onStart(at!)} data-testid="cm-cc-tour-resume">Resume</button>
          : p.onEnd && <button type="button" className={partner ? 'cm-btn-white' : 'cm-btn-line'} onClick={p.onEnd} data-testid="cm-cc-tour-end">End tour</button>}
        {state === 'paused' && p.onDismiss && (
          <button type="button" className="cm-tour-x" onClick={p.onDismiss} aria-label="Dismiss the paused tour" data-testid="cm-cc-tour-dismiss">{'×'}</button>
        )}
      </div>
    );
  }
  if (state === 'done') {
    return (
      <div className={`${cls} is-done`} data-testid="cm-cc-tour" data-state="done">
        <div style={{ flex: 1 }} className="d">✓ {partner ? 'You’ve taken the partner tour' : p.audience === 'explorer' ? 'Toured' : 'You’ve seen everything in your seat'} &middot;{' '}
          <button type="button" className="cm-link" onClick={() => p.onStart(0)} data-testid="cm-cc-tour-again">take the tour again</button></div>
      </div>
    );
  }
  const min = tourMinutes(n);
  const head = partner ? '▶ Start the partner tour' : p.audience === 'explorer' ? '🧭 Take the tour' : '🧭 What’s in your seat?';
  const body = partner ? `${n} stops, about ${min} min. See where your people learn and build.`
    : p.audience === 'explorer' ? `${n} stops, about ${min} min. See what your pass opens and what enrolling adds.`
      : `A ${min}-minute walk through the ${n} places your enrollment unlocks, including a few most people miss.`;
  return (
    <div className={cls} data-testid="cm-cc-tour" data-state="idle">
      <div style={{ flex: 1 }}><div className="t">{head}</div><div className="d">{body}</div></div>
      <button type="button" className={btn} onClick={() => p.onStart(0)} data-testid="cm-cc-tour-start">{partner ? 'Start the tour →' : 'Take the tour'}</button>
    </div>
  );
}
