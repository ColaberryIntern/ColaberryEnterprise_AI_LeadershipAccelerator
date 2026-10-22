import React from 'react';
import type { BuildingId, CampusAudience, CampusBuilding } from '../campusMap';
import { buildingName } from '../campusMap';
import type { PlanStop } from '../campusPlan';
import '../campusHome.css'; // the panel's card styles, shared by the page rail (all selectors are cm- scoped)

/**
 * WP-1 (owner rule: there is always a side panel with your next steps and the tours). The three pieces the campus home's side panel
 * and every page's rail share, so a step or the tour's state can never read differently in the two:
 *  - UpNext: the next unfinished step of today's plan, with Go (walk there) or, when you are already in its building, Open;
 *  - HereAt: what you can do in the building you are at (its main action, your plan step there, the tour stop);
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
}
export function UpNext({ stops, buildings, workplaceNames, hereId, onWalk, onOpen }: UpNextProps): React.ReactElement | null {
  const i = stops ? stops.findIndex((s) => !s.done) : -1;
  if (!stops || i < 0) return null;
  const s = stops[i];
  const b = s.buildingId ? buildings.find((x) => x.id === s.buildingId) : undefined;
  const at = !!b && b.id === hereId;
  return (
    <section className="cm-next" aria-label="Up next" data-testid="cm-up-next">
      <div className="cm-sec">Up next</div>
      <div className="cm-next-row">
        <span className="cm-pl-n" aria-hidden="true">{i + 1}</span>
        <span className="cm-next-t"><b>{s.title}</b><small>Step {i + 1} of {stops.length}{b ? ` · ${buildingName(b, workplaceNames)}` : ''}</small></span>
        {b && !at
          ? <button type="button" className="cm-btn-red" onClick={() => onWalk(b.id)} data-testid="cm-up-next-go">Go</button>
          : <button type="button" className="cm-btn-red" onClick={() => onOpen(s.route)} data-testid="cm-up-next-open">Open</button>}
      </div>
    </section>
  );
}

export interface HereAtProps {
  building: CampusBuilding | null;
  workplaceNames: boolean;
  stops: PlanStop[] | null;
  /** The tour stop at this building while a tour runs (1-based), and the tour's length. */
  tourStop: { n: number; of: number } | null;
  onOpen: (route: string) => void;
}
export function HereAt({ building: b, workplaceNames, stops, tourStop, onOpen }: HereAtProps): React.ReactElement | null {
  if (!b || b.kind === 'gate') return null;
  const planned = b.rooms.find((r) => r.route === b.primary.route)?.planned;
  const stepIdx = stops ? stops.findIndex((s) => !s.done && s.buildingId === b.id) : -1;
  const step = stops && stepIdx >= 0 ? stops[stepIdx] : null;
  return (
    <section className="cm-here" aria-label={`Here at ${buildingName(b, workplaceNames)}`} data-testid="cm-here-at">
      <div className="cm-sec">Here at {buildingName(b, workplaceNames)}</div>
      {tourStop && <div className="cm-here-tour" data-testid="cm-here-tour">Tour stop {tourStop.n} of {tourStop.of}</div>}
      {step && (
        <button type="button" className="cm-sg cm-here-step" onClick={() => onOpen(step.route)} data-testid="cm-here-step">
          <span style={{ flex: 1 }}><span className="t">{step.title}</span><span className="d">Today&rsquo;s plan &middot; step {stepIdx + 1} of {stops!.length}</span></span>
          <span className="go">Open the card &rarr;</span>
        </button>
      )}
      {!b.primary.admin && !planned && (
        <button type="button" className="cm-btn-line cm-here-cta" onClick={() => onOpen(b.primary.route)} data-testid="cm-here-cta">{b.primary.label} &rarr;</button>
      )}
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
}
export function TourOffer(p: TourOfferProps): React.ReactElement | null {
  if (!p.stops || !p.stops.length) return null;
  const n = p.stops.length;
  const name = (i: number) => { const b = p.buildings.find((x) => x.id === p.stops![Math.min(i, n - 1)].buildingId); return b ? buildingName(b, p.workplaceNames) : ''; };
  const partner = p.audience === 'business';
  const cls = partner ? 'cm-partner-tour cm-tour-offer' : 'cm-sg cm-tour-offer';
  const at = p.running ?? (p.paused !== null && p.paused < n ? p.paused : null);
  const state = p.running !== null ? 'running' : at !== null ? 'paused' : p.toured ? 'done' : 'idle';
  const btn = partner ? 'cm-btn-white' : 'cm-btn-red';
  if (state === 'running' || state === 'paused') {
    return (
      <div className={cls} data-testid="cm-cc-tour" data-state={state}>
        <div style={{ flex: 1 }}><div className="t">🧭 Tour in progress</div><div className="d">Stop {at! + 1} of {n} &middot; {name(at!)}</div></div>
        {state === 'paused'
          ? <button type="button" className={btn} onClick={() => p.onStart(at!)} data-testid="cm-cc-tour-resume">Resume</button>
          : p.onEnd && <button type="button" className={partner ? 'cm-btn-white' : 'cm-btn-line'} onClick={p.onEnd} data-testid="cm-cc-tour-end">End tour</button>}
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
