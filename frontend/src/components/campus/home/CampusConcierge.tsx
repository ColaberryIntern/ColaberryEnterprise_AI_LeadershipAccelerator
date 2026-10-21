import React from 'react';
import type { BuildingId, CampusAudience, CampusBuilding, ExplorerAccess } from '../campusMap';
import { buildingName } from '../campusMap';
import type { CampusPresence } from '../campusApi';
import type { PlanStop } from '../campusPlan';
import type { StaffDesk } from '../campusPeopleApi';
import { mayaAllowedFor } from '../campusPeople';
import { explorerPath } from '../campusPath';
import { HelpDesk, PlanCard, ExplorerPass, LiveCard, StaffTools } from './ConciergeCards';
import { greetingFor } from './useHomeFacts';

/**
 * The campus concierge (C11b), the prototype's left panel (.cc): where you are, a greeting by name, one honest line about now,
 * the campus pulse, the help desk, the account's own card (the Explorer pass, the tour offer), today's plan, the live card, and
 * "I want to..." chips that walk to a building. Everything comes from the campus state; nothing is staged.
 */
export interface ConciergeProps {
  /** Hidden while a card is open on the map (the prototype's .cc.tucked). */
  tucked?: boolean;
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
  hasTour: boolean;
  /** How many stops this viewer's tour has (the partner tour card says it). */
  tourStops?: number;
  now: Date;
  onWalk: (id: BuildingId) => void;
  onTour: () => void;
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

function leadFor(p: ConciergeProps, next: PlanStop | null): string {
  if (p.live) return 'Colaberry Live is on air right now.';
  if (next) return `Next on your plan: ${next.title}.`;
  if (p.audience === 'explorer') return 'Have a look around. Everything marked OPEN is yours to use.';
  if (p.audience === 'staff') return 'Here is where everyone is right now.';
  return 'You are on campus. Pick a building, or ask the help desk.';
}

export default function CampusConcierge(p: ConciergeProps): React.ReactElement {
  const { audience, buildings, workplaceNames } = p;
  const pulse = pulseOf(p.presence, buildings);
  const next = p.stops?.find((s) => !s.done && s.buildingId) ?? null;
  const desks = p.desks.filter((d) => d.id !== 'maya' || mayaAllowedFor(audience));
  const who = (n: number) => (audience === 'member' ? (n === 1 ? 'classmate' : 'classmates') : (n === 1 ? 'person' : 'people'));
  const greeting = `${greetingFor(p.now.getHours())}${p.firstName ? `, ${p.firstName}` : ''}.`;
  return (
    <aside className={`cm-cc${p.tucked ? ' is-tucked' : ''}`} aria-label="Campus concierge" data-testid="cm-concierge" hidden={p.tucked}>
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

      <HelpDesk desks={desks} onWalk={p.onWalk} />

      {audience === 'explorer' && <ExplorerPass buildings={buildings} accessOf={p.accessOf} workplaceNames={workplaceNames}
        path={explorerPath(buildings, p.accessOf, workplaceNames, desks.some((d) => d.id === 'maya' && d.on_duty))} />}

      {audience === 'staff' && <StaffTools buildings={buildings} workplaceNames={workplaceNames} />}

      {p.hasTour && audience === 'business' && (
        <div className="cm-partner-tour" data-testid="cm-cc-tour">
          <div className="t">See how your people learn and build</div>
          <div className="d">A short walk through the places your team uses{p.tourStops ? `, ${p.tourStops} stops` : ''}.</div>
          <button type="button" className="cm-btn-white" onClick={p.onTour} data-testid="cm-cc-tour-start">Start the partner tour →</button>
        </div>
      )}
      {p.hasTour && audience !== 'business' && (
        <div className="cm-sg" data-testid="cm-cc-tour" style={{ cursor: 'default' }}>
          <div style={{ flex: 1 }}><div className="t">What&rsquo;s in your seat?</div><div className="d">A short walk through the places your {audience === 'explorer' ? 'pass opens' : 'enrollment unlocks'}.</div></div>
          <button type="button" className="cm-btn-red" onClick={p.onTour} data-testid="cm-cc-tour-start">Take the tour</button>
        </div>
      )}

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
    </aside>
  );
}
