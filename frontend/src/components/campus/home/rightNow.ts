import type { BuildingId, CampusAudience, CampusBuilding } from '../campusMap';
import { buildingName } from '../campusMap';
import type { CampusPerson, CampusPresence } from '../campusApi';
import type { PlanStop } from '../campusPlan';
import { sessionStartMs, urgentAt } from '../campusFacts';
import type { HomeAgenda } from './useMapMoments';
import { shortIn } from './useMapMoments';
import { pulseOf, wd } from './conciergeCopy';

/**
 * The panel's "Right now" list and urgent card (WP-4; the prototype's #sugg and #urgent, D:1867-1878), from real data only: your
 * next plan step, the next live class, where people are, the next event. The prototype's suggestions ("Claude Code Knowledge Check
 * +10 pts", "1 person in the room now") were samples; each row here is one of the four facts or it is not shown. While Colaberry
 * Live is on air the list steps aside (the live card takes over), as in the prototype.
 */
export interface NowRow { key: string; buildingId: BuildingId; title: string; detail: string }
export interface Urgent { buildingId: BuildingId; title: string; detail: string; route: string }
export interface TeamRow { key: string; buildingId: BuildingId; name: string; detail: string; person: CampusPerson }

const MAX_ROWS = 3;

/** "In 15d" / "In 3h" / "Today" (the Events Hall badge's words); null once it has started. */
export function eventIn(startsAt: string, now: number): string | null {
  const m = Math.round((new Date(startsAt).getTime() - now) / 60000);
  if (!(m >= 0)) return null;
  return m >= 1440 ? `In ${Math.floor(m / 1440)}d` : m >= 60 ? `In ${Math.floor(m / 60)}h` : 'Today';
}

/** The urgent card: a member's live class starting within 15 minutes, or live now. "Run there" runs; "Skip the walk" opens it. */
export function urgentOf(audience: CampusAudience, agenda: HomeAgenda | null, buildings: CampusBuilding[], workplace: boolean): Urgent | null {
  if (audience !== 'member' || !agenda) return null;
  const s = agenda.lecture.session;
  const u = urgentAt('lecture', agenda.lecture, agenda.now);
  const b = buildings.find((x) => x.id === 'lecture');
  if (!s || !u || !b) return null;
  const start = sessionStartMs(s);
  const left = start !== null ? Math.max(0, Math.round((start - agenda.now) / 60000)) : 0;
  const title = s.status === 'live' || left === 0 ? 'Live class is starting now' : `Live class starts in ${left} min`;
  return { buildingId: 'lecture', title: wd(title, workplace), detail: `${s.title || 'Today’s session'} · ${buildingName(b, workplace)}`, route: u.route };
}

export function rightNowRows(o: {
  audience: CampusAudience; workplace: boolean; buildings: CampusBuilding[]; stops: PlanStop[] | null; planMinutes: number | null;
  agenda: HomeAgenda | null; presence: CampusPresence | null; presenceError: boolean; live: boolean; urgent: Urgent | null;
}): NowRow[] {
  if (o.live || o.audience === 'business') return [];
  const has = (id: BuildingId) => o.buildings.some((b) => b.id === id);
  const rows: NowRow[] = [];
  const next = o.stops?.find((s) => !s.done && s.buildingId) ?? null;
  if (next && o.audience === 'member') {
    // C13: the step's OWN minutes (the plan total never shrank as steps got done)
    rows.push({ key: 'plan', buildingId: next.buildingId!, title: 'Continue today’s plan', detail: `${next.minutes ? `${next.minutes} min · ` : ''}${next.title}` });
  }
  const s = o.agenda?.lecture.session;
  const start = s ? sessionStartMs(s) : null;
  const left = s && start !== null && o.agenda ? shortIn(start, o.agenda.now) : null;
  if (s && left && !o.urgent && s.status !== 'live' && has('lecture')) {
    rows.push({ key: 'class', buildingId: 'lecture', title: wd('Next live class', o.workplace), detail: `${s.title || 'Live class'} · in ${left}` });
  }
  const p = pulseOf(o.presenceError ? null : o.presence, o.buildings);
  if (p.busiest && p.busiestCount > 0) {
    rows.push({ key: 'people', buildingId: p.busiest.id, title: `Drop into the ${buildingName(p.busiest, o.workplace)}`, detail: `${p.busiestCount} ${p.busiestCount === 1 ? 'person' : 'people'} here now` });
  }
  const e = o.agenda?.amphi.event;
  const when = e && o.agenda ? eventIn(e.starts_at, o.agenda.now) : null;
  if (e && when && has('amphi')) rows.push({ key: 'event', buildingId: 'amphi', title: e.title, detail: when });
  return rows.slice(0, MAX_ROWS);
}

/** A partner's "Your team on campus right now": their server names only teammates, so each named person is on their team. */
export function teamRows(presence: CampusPresence | null, presenceError: boolean, buildings: CampusBuilding[], workplace: boolean): TeamRow[] {
  if (!presence || presenceError) return [];
  const out: TeamRow[] = [];
  for (const b of buildings) {
    for (const e of presence[b.id]?.people ?? []) {
      if ('enrollment_id' in e) out.push({ key: e.enrollment_id, buildingId: b.id, name: e.display_name, detail: `In ${buildingName(b, workplace)}`, person: e });
    }
  }
  return out;
}
