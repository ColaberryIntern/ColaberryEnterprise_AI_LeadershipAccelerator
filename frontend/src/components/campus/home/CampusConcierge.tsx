import React from 'react';
import type { BuildingId, CampusAudience, CampusBuilding, ExplorerAccess } from '../campusMap';
import { buildingName } from '../campusMap';
import type { CampusPresence } from '../campusApi';
import type { PlanStop } from '../campusPlan';
import type { StaffDesk } from '../campusPeopleApi';
import { mayaAllowedFor } from '../campusPeople';
import { explorerPath } from '../campusPath';
import { HelpDesk, PlanCard, ExplorerPass, StaffTools } from './ConciergeCards';
import LiveCard from './LiveCard';
import { UpNext, RoomsHere, TourOffer } from './NextSteps';
import type { CompleteResult } from '../campusPlanApi';
import { UrgentCard, RightNow, TeamNow, Directory } from './PanelNow';
import { greetLine, kickerFor, leadFor, momentOf, pulseLine, pulseOf } from './conciergeCopy';
import { rightNowRows, teamRows } from './rightNow';
import type { Urgent } from './rightNow';
import type { HomeAgenda } from './useMapMoments';

/**
 * The campus concierge (C11b), the prototype's left panel (.cc): where you are, a greeting by name, one honest line about now,
 * the campus pulse, the help desk, the account's own card (the Explorer pass, the tour offer), today's plan, the live card, and
 * "I want to..." chips that walk to a building. Everything comes from the campus state; nothing is staged.
 *
 * WP-1 (owner rule, overriding the prototype's tuck): the panel is always there, with your next steps and the tour. It never
 * hides: while a card is open on a phone it shrinks to a peek strip (Next and the tour); on wide screens it stays beside the card.
 *
 * WP-4: the prototype's words for each account (conciergeCopy), the urgent card, "Right now" (a partner: their team on campus), the
 * help desk's role labels (not for partners, as in the prototype), the campus directory and "I'm running late".
 */
import PhotoPrompt from './PhotoPrompt';

export interface ConciergeProps {
  /** WP-7: your photo (null: none), for the photo prompt at the foot of the panel. */
  photo?: string | null;
  /** A card is open on the map: on a phone the panel becomes its peek strip (never hidden). */
  cardOpen?: boolean;
  /** WP-3: the gate is still up: the panel waits (laid out, invisible) and slides in when it is revealed. */
  waiting?: boolean;
  audience: CampusAudience;
  firstName: string;
  buildings: CampusBuilding[];
  accessOf: (b: CampusBuilding) => ExplorerAccess;
  workplaceNames: boolean;
  presence: CampusPresence | null;
  presenceError: boolean;
  desks: StaffDesk[];
  stops: PlanStop[] | null;
  planMinutes?: number | null;
  live: { title: string; buildingId: BuildingId | null; state?: string } | null;
  /** The building you are at (null at the gate). */
  hereId?: BuildingId | null;
  /** C17: you walked out onto the grass (no building and not at the gate): the kicker reads "On campus". */
  onLawn?: boolean;
  /** This viewer's tour stops (null: no tour, e.g. staff), the stop on screen while it runs, and its saved progress. */
  tourStops: { buildingId: BuildingId }[] | null;
  touring: number | null;
  tourProgress: { paused: number | null; toured: boolean };
  now: Date;
  /** WP-4: the next live class and event, and the urgent item (a class within 15 minutes). */
  agenda?: HomeAgenda | null;
  urgent?: Urgent | null;
  onWalk: (id: BuildingId) => void;
  /** WP-4: run there (the urgent card, "I'm running late"). */
  onRun?: (id: BuildingId) => void;
  /** WP-4: a Right now row is hovered: lift that building on the map (null: none). */
  onHover?: (id: BuildingId | null) => void;
  /** Starts the tour at a stop (0, or the paused stop for Resume). */
  onTour: (from: number) => void;
  onEndTour?: () => void;
  /** C13: × on a paused tour. */
  onDismissTour?: () => void;
  /** C15: Mark done from Up next (the arrival card's own completion: points, "Next: … [Go]", plan pins). */
  onDone?: (stop: PlanStop) => Promise<CompleteResult>;
  /** Opens a page through its building's door. */
  onOpen: (route: string) => void;
  /** WP-2: the tour was just finished (the lead says what it covered and your next step). */
  justToured?: boolean;
}

/** The prototype's "I want to..." chips per account (CHIPS, CHIPS_EXP, CHIPS_SP, CHIPS_WORK), each a walk to a real building. "I'm
 *  running late" runs to the urgent class, or walks to the Schedule; the Explorer's sign-up shortcut waits for the sign-up sheet. */
export const LATE = 'late';
export const CHIPS: Record<'member' | 'explorer' | 'business' | 'work', [string, BuildingId | typeof LATE][]> = {
  member: [['Learn', 'lecture'], ['Build', 'studio'], ['Prep for cert', 'testing'], ['Meet people', 'commons'], ['See my progress', 'observatory'], ['Show my work', 'gallery'], ['Find events', 'amphi'], ['I’m running late', LATE]],
  explorer: [['Try the course', 'library'], ['Meet people', 'commons'], ['Upcoming events', 'amphi'], ['See how projects work', 'studio']],
  business: [['…learns', 'lecture'], ['…builds', 'studio'], ['…gets certified', 'testing'], ['…connects', 'commons'], ['…shows their work', 'gallery'], ['Seats & reporting', 'career']],
  work: [['Upskill', 'lecture'], ['Ship work', 'studio'], ['Get certified', 'testing'], ['Meet the team', 'commons'], ['My performance', 'observatory'], ['Show clients', 'gallery'], ['Town halls', 'amphi'], ['I’m running late', LATE]],
};
export function chipsFor(audience: CampusAudience, workplaceNames: boolean, buildings: CampusBuilding[]): [string, BuildingId | typeof LATE][] {
  const set = audience === 'explorer' ? CHIPS.explorer : audience === 'business' ? CHIPS.business : workplaceNames ? CHIPS.work : CHIPS.member;
  return set.filter(([, id]) => (id === LATE ? buildings.some((b) => b.id === 'tower') : buildings.some((b) => b.id === id)));
}

export { pulseOf, liveKicker } from './conciergeCopy';

function Pulse({ p }: { p: ConciergeProps }): React.ReactElement | null {
  const line = pulseLine({ audience: p.audience, workplace: p.workplaceNames, presence: p.presence, presenceError: p.presenceError, buildings: p.buildings, staffOnDuty: p.desks.some((d) => d.on_duty) });
  if (!line) return null;
  const busiest = pulseOf(p.presence, p.buildings).busiest;
  const reese = p.desks.find((d) => d.id === 'reese' && d.on_duty) ?? p.desks.find((d) => d.on_duty);
  const body = <><i className={`dot is-${line.tone}`} aria-hidden="true" /><span><b>{line.bold}</b>{line.rest && <> &middot; {line.rest}</>}</span></>;
  // Quiet hours: a press goes to the help desk (the prototype opens Reese's chat; the staff popover is WP-5), else to the busiest building.
  const go = line.walk && busiest ? () => p.onWalk(busiest.id) : line.tone === 'quiet' && reese ? () => p.onWalk(reese.building as BuildingId) : null;
  if (!go) return <div className="cm-pulse" role={line.tone === 'down' ? 'status' : undefined} data-testid="cm-cc-pulse" data-tone={line.tone}>{body}</div>;
  return <button type="button" className="cm-pulse" onClick={go} data-testid="cm-cc-pulse" data-tone={line.tone}>{body}{line.walk && <span style={{ marginLeft: 'auto' }} aria-hidden="true">&rarr;</span>}</button>;
}

export default function CampusConcierge(p: ConciergeProps): React.ReactElement {
  const { audience, buildings, workplaceNames: wp } = p;
  const next = p.stops?.find((s) => !s.done && s.buildingId) ?? null;
  const desks = p.desks.filter((d) => d.id !== 'maya' || mayaAllowedFor(audience));
  const quiet = !!p.presence && !p.presenceError && pulseOf(p.presence, buildings).total === 0;
  const [expanded, setExpanded] = React.useState(false);
  React.useEffect(() => { if (!p.cardOpen) setExpanded(false); }, [p.cardOpen]);
  const hereB = p.hereId ? buildings.find((b) => b.id === p.hereId) ?? null : null;
  const liveB = p.live?.buildingId ? buildings.find((b) => b.id === p.live!.buildingId) : undefined;
  const moment = momentOf({ live: !!p.live, justToured: !!p.justToured, presenceError: p.presenceError, classSoon: !!p.urgent, quiet });
  const lead = leadFor({ audience, moment, firstName: p.firstName, workplace: wp, buildings, liveAt: liveB ? buildingName(liveB, wp) : null, next,
    dutyNames: desks.filter((d) => d.on_duty).map((d) => d.name), tourStops: p.tourStops?.length ?? null, liveState: p.live?.state,
    onCampus: p.presence && !p.presenceError ? pulseOf(p.presence, buildings).total : null });
  const nextAny = p.stops?.find((s) => !s.done) ?? null;
  const hover = p.onHover ?? (() => undefined);
  const run = (id: BuildingId) => (p.onRun ?? p.onWalk)(id);
  const rows = rightNowRows({ audience, workplace: wp, buildings, stops: p.stops, planMinutes: p.planMinutes ?? null, agenda: p.agenda ?? null,
    presence: p.presence, presenceError: p.presenceError, live: !!p.live, urgent: p.urgent ?? null, skipPlan: true });
  const chip = (id: BuildingId | typeof LATE) => (id === LATE ? (p.urgent ? run(p.urgent.buildingId) : p.onWalk('tower')) : p.onWalk(id));
  return (
    <aside className={`cm-cc${p.cardOpen ? ' has-card' : ''}${p.waiting ? ' is-waiting' : ''}${expanded ? ' is-expanded' : ''}`} aria-label="Campus concierge" data-testid="cm-concierge">
      {/* phones, while a card is open: the peek strip (CSS shows it only there) */}
      <div className="cm-cc-peek" data-testid="cm-cc-peek">
        <button type="button" className="cm-cc-handle" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}
          aria-label={expanded ? 'Show less of your next steps' : 'Show all your next steps'}><i aria-hidden="true" /></button>
        <span className="cm-cc-peek-t">{nextAny ? <>Next: <b>{nextAny.title}</b></> : <b>Your next steps</b>}</span>
        {nextAny?.buildingId && <button type="button" className="cm-btn-red" onClick={() => p.onWalk(nextAny.buildingId!)}>Go</button>}
        {p.tourStops && p.touring === null && <button type="button" className="cm-btn-line" onClick={() => p.onTour(p.tourProgress.paused ?? 0)}>Tour</button>}
      </div>
      <div className="cm-cc-body">
      <div className="cm-kicker" data-testid="cm-cc-where">{kickerFor({ audience, here: hereB, workplace: wp, live: !!p.live, now: p.now, onLawn: p.onLawn })}</div>
      <h1 data-testid="cm-cc-greeting">{greetLine(audience, p.firstName, p.now.getHours(), quiet)}</h1>
      <p className="cm-lead" data-testid="cm-cc-lead">{lead}</p>
      <Pulse p={p} />

      {/* C15 (v3 2.6), each fact once, in this order: Up next (the urgent card takes its slot), Live, the tour, the rooms here,
          today's plan (the Up next step tagged, not repeated), right now, the help desk, I want to… */}
      {p.urgent && !p.live
        ? <UrgentCard u={p.urgent} onRun={() => run(p.urgent!.buildingId)} onSkip={() => p.onOpen(p.urgent!.route)} />
        : <UpNext stops={p.stops} buildings={buildings} workplaceNames={wp} hereId={p.hereId ?? null} onWalk={p.onWalk} onOpen={p.onOpen} onDone={p.onDone} />}
      {p.live && <LiveCard title={p.live.title} buildingId={p.live.buildingId} place={liveB ? buildingName(liveB, wp) : null} audience={audience}
        teamHere={liveB && p.presence && !p.presenceError ? (p.presence[liveB.id]?.people ?? []).filter((e) => 'enrollment_id' in e).length : null}
        onWalk={(id, r) => (r ? run(id) : p.onWalk(id))} />}
      <TourOffer audience={audience} stops={p.tourStops} buildings={buildings} workplaceNames={wp} running={p.touring}
        paused={p.tourProgress.paused} toured={p.tourProgress.toured} onStart={p.onTour} onEnd={p.onEndTour} onDismiss={p.onDismissTour} />
      <RoomsHere building={hereB} workplaceNames={wp} onOpen={p.onOpen} />

      {audience === 'explorer' && <ExplorerPass buildings={buildings} accessOf={p.accessOf} workplaceNames={wp}
        path={explorerPath(buildings, p.accessOf, wp, desks.some((d) => d.id === 'maya' && d.on_duty))} />}
      {audience === 'staff' && <StaffTools buildings={buildings} workplaceNames={wp} />}

      {p.stops && <div style={{ marginTop: 14 }}><PlanCard stops={p.stops} buildings={buildings} workplaceNames={wp} onWalk={p.onWalk} /></div>}

      {audience === 'business'
        ? <TeamNow rows={teamRows(p.presence, p.presenceError, buildings, wp)} buildings={buildings} workplace={wp} onWalk={p.onWalk} onHover={hover} />
        : <RightNow rows={rows} buildings={buildings} workplace={wp} onWalk={p.onWalk} onHover={hover} />}
      {audience !== 'business' && <HelpDesk desks={desks} workplace={wp} />}

      <div className="cm-sec">{audience === 'business' ? 'See where your team…' : 'I want to…'}</div>
      <div className="cm-chips" data-testid="cm-cc-chips">
        {chipsFor(audience, wp, buildings).map(([label, id]) => <button key={id} type="button" onClick={() => chip(id)}>{label}</button>)}
      </div>
      <Directory buildings={buildings} audience={audience} workplace={wp} onWalk={p.onWalk} />
      {p.photo !== undefined && <PhotoPrompt audience={audience} photo={p.photo} />}
      </div>
    </aside>
  );
}
