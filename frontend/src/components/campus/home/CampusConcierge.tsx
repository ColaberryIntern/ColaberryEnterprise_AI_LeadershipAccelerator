import React from 'react';
import type { BuildingId, CampusAudience, CampusBuilding, ExplorerAccess } from '../campusMap';
import { buildingName } from '../campusMap';
import type { CampusPresence } from '../campusApi';
import type { PlanStop } from '../campusPlan';
import type { StaffDesk } from '../campusPeopleApi';
import { mayaAllowedFor } from '../campusPeople';
import { explorerPath } from '../campusPath';
import { HelpDesk, PlanCard, ExplorerPass, LiveCard, StaffTools } from './ConciergeCards';
import { UpNext, HereAt, TourOffer } from './NextSteps';
import { greetingFor } from './useHomeFacts';

/**
 * The campus concierge (C11b), the prototype's left panel (.cc): where you are, a greeting by name, one honest line about now,
 * the campus pulse, the help desk, the account's own card (the Explorer pass, the tour offer), today's plan, the live card, and
 * "I want to..." chips that walk to a building. Everything comes from the campus state; nothing is staged.
 *
 * WP-1 (owner rule, overriding the prototype's tuck): the panel is always there, with your next steps and the tour, in this order:
 * where you are and the greeting, Up next, Here at <building> (while you are at one), the tour card in its three states, today's
 * plan, live, the help desk and the chips. It never hides: while a card is open on a phone it shrinks to a peek strip (Next and
 * the tour) that opens back up on a tap; on wide screens it stays beside the card.
 */
export interface ConciergeProps {
  /** A card is open on the map: on a phone the panel becomes its peek strip (never hidden). */
  cardOpen?: boolean;
  audience: CampusAudience;
  firstName: string;
  hereName: string;
  buildings: CampusBuilding[];
  accessOf: (b: CampusBuilding) => ExplorerAccess;
  workplaceNames: boolean;
  presence: CampusPresence | null;
  presenceError: boolean;
  desks: StaffDesk[];
  stops: PlanStop[] | null;
  live: { title: string; buildingId: BuildingId | null } | null;
  /** The building you are at (null at the gate). */
  hereId?: BuildingId | null;
  /** This viewer's tour stops (null: no tour, e.g. staff), the stop on screen while it runs, and its saved progress. */
  tourStops: { buildingId: BuildingId }[] | null;
  touring: number | null;
  tourProgress: { paused: number | null; toured: boolean };
  now: Date;
  onWalk: (id: BuildingId) => void;
  /** Starts the tour at a stop (0, or the paused stop for Resume). */
  onTour: (from: number) => void;
  onEndTour?: () => void;
  /** Opens a page through its building's door. */
  onOpen: (route: string) => void;
  /** WP-2: the tour was just finished (the lead says what it covered and your next step). */
  justToured?: boolean;
}

/** The prototype's "I want to..." chips per account (CHIPS, CHIPS_EXP, CHIPS_SP, CHIPS_WORK), each a walk to a real building. The
 *  prototype's two non-places ("I'm running late", a sign-up shortcut) are left out: the pass already carries the enroll link. */
export const CHIPS: Record<'member' | 'explorer' | 'business' | 'work', [string, BuildingId][]> = {
  member: [['Learn', 'lecture'], ['Build', 'studio'], ['Prep for cert', 'testing'], ['Meet people', 'commons'], ['See my progress', 'observatory'], ['Show my work', 'gallery'], ['Find events', 'amphi']],
  explorer: [['Try the course', 'library'], ['Meet people', 'commons'], ['Upcoming events', 'amphi'], ['See how projects work', 'studio']],
  business: [['…learns', 'lecture'], ['…builds', 'studio'], ['…gets certified', 'testing'], ['…connects', 'commons'], ['…shows their work', 'gallery'], ['Seats & reporting', 'career']],
  work: [['Upskill', 'lecture'], ['Ship work', 'studio'], ['Get certified', 'testing'], ['Meet the team', 'commons'], ['My performance', 'observatory'], ['Show clients', 'gallery'], ['Town halls', 'amphi']],
};
export function chipsFor(audience: CampusAudience, workplaceNames: boolean, buildings: CampusBuilding[]): [string, BuildingId][] {
  const set = audience === 'explorer' ? CHIPS.explorer : audience === 'business' ? CHIPS.business : workplaceNames ? CHIPS.work : CHIPS.member;
  return set.filter(([, id]) => buildings.some((b) => b.id === id));
}

export function pulseOf(presence: CampusPresence | null, buildings: CampusBuilding[]): { total: number; busiest: CampusBuilding | null; busiestCount: number } {
  let total = 0, busiest: CampusBuilding | null = null, busiestCount = 0;
  for (const b of buildings) {
    const n = presence?.[b.id]?.count ?? 0;
    total += n;
    if (n > busiestCount) { busiest = b; busiestCount = n; }
  }
  return { total, busiest, busiestCount };
}

/** While Colaberry Live is on air the concierge says so, as the prototype's "Colaberry Live · Thursday night" (Central time). */
export function liveKicker(now: Date): string {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long' }).format(now);
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(now));
  return `Colaberry Live · ${day}${hour >= 17 ? ' night' : ''}`;
}

/** After the tour (the prototype's finishTour lead): what the tour covered, and your real next step if you have one. */
function afterTourLead(p: ConciergeProps, next: PlanStop | null): string {
  const you = p.firstName ? `, ${p.firstName}` : '';
  if (p.audience === 'explorer') return `That’s the whole campus${you}. Everything marked OPEN is yours to keep using, and enrolling opens the rest.`;
  if (p.audience === 'business') return 'Tour complete. Your company page is in the Partner Office whenever you need it.';
  const b = next?.buildingId ? p.buildings.find((x) => x.id === next.buildingId) : undefined;
  return `That’s everything in your seat${you}.${next && b ? ` Your next step, ${next.title}, is waiting in the ${buildingName(b, p.workplaceNames)}.` : ''}`;
}

function leadFor(p: ConciergeProps, next: PlanStop | null): string {
  if (p.live) return 'Colaberry Live is on air right now.';
  if (p.justToured) return afterTourLead(p, next);
  if (next) return `Next on your plan: ${next.title}.`;
  if (p.audience === 'explorer') return 'Have a look around. Everything marked OPEN is yours to use.';
  if (p.audience === 'staff') return 'Here is where everyone is right now.';
  if (p.audience === 'business') return 'See where your team learns and builds. Pick a building, or take the partner tour.';
  return 'You are on campus. Pick a building, or ask the help desk.';
}

export default function CampusConcierge(p: ConciergeProps): React.ReactElement {
  const { audience, buildings, workplaceNames } = p;
  const pulse = pulseOf(p.presence, buildings);
  const next = p.stops?.find((s) => !s.done && s.buildingId) ?? null;
  const desks = p.desks.filter((d) => d.id !== 'maya' || mayaAllowedFor(audience));
  const who = (n: number) => (audience === 'member' ? (n === 1 ? 'classmate' : 'classmates') : (n === 1 ? 'person' : 'people'));
  const greeting = `${greetingFor(p.now.getHours())}${p.firstName ? `, ${p.firstName}` : ''}.`;
  const [expanded, setExpanded] = React.useState(false);
  React.useEffect(() => { if (!p.cardOpen) setExpanded(false); }, [p.cardOpen]);
  const hereB = p.hereId ? buildings.find((b) => b.id === p.hereId) ?? null : null;
  const tourHere = p.tourStops && p.touring !== null && p.touring < p.tourStops.length ? { n: p.touring + 1, of: p.tourStops.length } : null;
  const nextAny = p.stops?.find((s) => !s.done) ?? null;
  const tourOffer = <TourOffer audience={audience} stops={p.tourStops} buildings={buildings} workplaceNames={workplaceNames} running={p.touring}
    paused={p.tourProgress.paused} toured={p.tourProgress.toured} onStart={p.onTour} onEnd={p.onEndTour} />;
  return (
    <aside className={`cm-cc${p.cardOpen ? ' has-card' : ''}${expanded ? ' is-expanded' : ''}`} aria-label="Campus concierge" data-testid="cm-concierge">
      {/* phones, while a card is open: the peek strip (CSS shows it only there) */}
      <div className="cm-cc-peek" data-testid="cm-cc-peek">
        <button type="button" className="cm-cc-handle" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}
          aria-label={expanded ? 'Show less of your next steps' : 'Show all your next steps'}><i aria-hidden="true" /></button>
        <span className="cm-cc-peek-t">{nextAny ? <>Next: <b>{nextAny.title}</b></> : <b>Your next steps</b>}</span>
        {nextAny?.buildingId && <button type="button" className="cm-btn-red" onClick={() => p.onWalk(nextAny.buildingId!)}>Go</button>}
        {p.tourStops && p.touring === null && <button type="button" className="cm-btn-line" onClick={() => p.onTour(p.tourProgress.paused ?? 0)}>Tour</button>}
      </div>
      <div className="cm-cc-body">
      <div className="cm-kicker" data-testid="cm-cc-where">{p.live ? liveKicker(p.now) : p.hereName === 'main gate' && audience === 'business' ? 'Partner visit' : p.hereName === 'main gate' && audience === 'staff' ? 'Staff view \u00b7 every building' : `At the ${p.hereName}`}</div>
      <h1 data-testid="cm-cc-greeting">{greeting}</h1>
      <p className="cm-lead" data-testid="cm-cc-lead">{leadFor(p, next)}</p>

      {p.presenceError
        ? <div className="cm-pulse" role="status" data-testid="cm-cc-pulse"><i className="dot is-quiet" aria-hidden="true" /><span><b>Live presence is unavailable</b> &middot; headcounts are hidden, not zero</span></div>
        : p.presence && (pulse.total > 0
          ? <button type="button" className="cm-pulse" onClick={() => pulse.busiest && p.onWalk(pulse.busiest.id)} data-testid="cm-cc-pulse">
              <i className="dot" aria-hidden="true" /><span><b>{pulse.total} {who(pulse.total)} on campus</b>{pulse.busiest && <> &middot; busiest: {buildingName(pulse.busiest, workplaceNames)} ({pulse.busiestCount})</>}</span>
              <span style={{ marginLeft: 'auto' }} aria-hidden="true">&rarr;</span>
            </button>
          : <div className="cm-pulse" data-testid="cm-cc-pulse"><i className="dot is-quiet" aria-hidden="true" /><span><b>Quiet right now</b> &middot; nobody else is on campus{desks.some((d) => d.on_duty) ? ' · the help desk is on duty' : ''}</span></div>)}

      <UpNext stops={p.stops} buildings={buildings} workplaceNames={workplaceNames} hereId={p.hereId ?? null} onWalk={p.onWalk} onOpen={p.onOpen} />
      <HereAt building={hereB} workplaceNames={workplaceNames} stops={p.stops} tourStop={tourHere} onOpen={p.onOpen} />
      {tourOffer}

      <HelpDesk desks={desks} onWalk={p.onWalk} />

      {audience === 'explorer' && <ExplorerPass buildings={buildings} accessOf={p.accessOf} workplaceNames={workplaceNames}
        path={explorerPath(buildings, p.accessOf, workplaceNames, desks.some((d) => d.id === 'maya' && d.on_duty))} />}

      {audience === 'staff' && <StaffTools buildings={buildings} workplaceNames={workplaceNames} />}

      {p.stops && <div style={{ marginTop: 14 }}><PlanCard stops={p.stops} buildings={buildings} workplaceNames={workplaceNames} onWalk={p.onWalk} /></div>}
      {p.live && <LiveCard title={p.live.title} buildingId={p.live.buildingId} onWalk={p.onWalk} />}

      {/* Staff have the staff tools card instead of the learner chips. */}
      {audience !== 'staff' && (
        <>
          <div className="cm-sec">{audience === 'business' ? 'See how your team…' : 'I want to…'}</div>
          <div className="cm-chips" data-testid="cm-cc-chips">
            {chipsFor(audience, workplaceNames, buildings).map(([label, id]) => (
              <button key={id} type="button" onClick={() => p.onWalk(id)}>{label}</button>
            ))}
          </div>
        </>
      )}
      </div>
    </aside>
  );
}
