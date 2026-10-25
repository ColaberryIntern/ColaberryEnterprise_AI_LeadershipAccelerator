import type { BuildingId, CampusAudience, CampusBuilding, ExplorerAccess } from './campusMap';
import { BUILDING_ICON, buildingName, roomLabel } from './campusMap';
import type { CampusPerson, CampusPresence } from './campusApi';
import type { StaffDesk } from './campusPeopleApi';
import { subOf } from './campusArrival';

/**
 * The Wayfinder's search (WP-4; the prototype's buildDest + matcher, D:1897-1945). Pure.
 *  - every building (its name, its line and the prototype's keyword synonyms, so "standup" finds the Internship Office and "my
 *    points" My Progress), every room this viewer can open, the people the server NAMED in presence, and the AI staff on duty;
 *  - every word typed must match (AND); a match at the start of the title counts most; buildings edge out rooms; nine results,
 *    with up to five people first;
 *  - an empty query lists Happening now, Suggested for you, Staff · always on and All buildings.
 * Anonymous presence is never searchable, so the Wayfinder cannot reveal anyone the people lists would not.
 */
export type WfKind = 'urgent' | 'building' | 'room' | 'person' | 'staff' | 'suggested' | 'book';
export interface WfItem {
  key: string;
  kind: WfKind;
  title: string;
  sub: string;
  buildingId: BuildingId;
  /** The room to flash on arrival (rooms), or open (urgent "Skip the walk" is the panel's; here a pick walks). */
  route?: string;
  person?: CampusPerson;
  run?: boolean;
  /** "Walk →", "Run →", "View", "🔒 Peek". */
  action: string;
  group: string;
}

/** The prototype's `keys` per building, verbatim (with the business district's extra words). */
export const WF_KEYS: Partial<Record<BuildingId, string>> = {
  lecture: 'class classroom lesson lessons week lecture session sessions live check in checkin attendance learn study today plan broadcast on air watch stream colaberry replay',
  library: 'library curriculum lessons reading reference resources guides docs study',
  tower: 'schedule calendar agenda today time when late what next tower clock plan',
  studio: 'project projects build builds ship code workspace assignment assignments blueprint homework studio sprint board ticket tickets jira kanban work office hq client deliverable',
  amphi: 'event events open house rsvp demo talk meetup amphitheater',
  testing: 'cert certification prep exam test quiz knowledge check claude code verify skills proficiency',
  observatory: 'path progress points streak tier level rank skills radar me my growth observatory',
  commons: 'community people classmates chat rooms room hang lounge social time break commons friends',
  gallery: 'portfolio showcase gallery work share resume demo show showroom demos client clients present',
  career: 'internship intern standup stand-up meeting company job career team orientation handoff client clients engagement engagements management portal employee company office tower',
  arcade: 'game games arcade play break relax fun chase maze slingshot launch breakout bricks score scores leaderboard rest',
  admissions: 'admissions plans plan pricing price cost subscription billing enroll enrollment seats seat license licenses team maya welcome',
};
const STAFF_KEYS = 'staff help mentor stuck question curriculum certification';
const MAYA_KEYS = 'admissions enroll enrolling price cost pay sponsor employer apply join person call';
/** C20 (round 3 §2.7): 'Book a call with admissions' for learners and Explorers, under Help; its words as the spec lists them. */
const BOOK_KEYS = 'book call admissions person talk enroll human appointment real';
function bookItem(c: WfContext): (WfItem & { keys: string }) | null {
  if (c.audience !== 'member' && c.audience !== 'explorer') return null;
  return { key: 'book', kind: 'book', title: 'Book a call with admissions', sub: 'A real person · 30 minutes on Google Meet', buildingId: 'gate', action: 'Book →', group: 'Help', keys: BOOK_KEYS };
}
const URGENT_WORDS = ['late', 'now', 'standup', 'class', 'meeting', 'hurry'];
export const WF_LIMIT = 9;
const PEOPLE_LIMIT = 5;

export interface WfContext {
  audience: CampusAudience;
  workplace: boolean;
  buildings: CampusBuilding[];
  accessOf: (b: CampusBuilding) => ExplorerAccess;
  presence: CampusPresence | null;
  desks: StaffDesk[];
  urgent: { buildingId: BuildingId; title: string; detail: string } | null;
  suggested: { key: string; buildingId: BuildingId; title: string; detail: string }[];
}

const walkLabel = (c: WfContext, id: BuildingId) => {
  const b = c.buildings.find((x) => x.id === id);
  return c.audience === 'explorer' && b && c.accessOf(b) === 'locked' ? '🔒 Peek' : 'Walk →';
};
const nameOf = (c: WfContext, id: BuildingId) => { const b = c.buildings.find((x) => x.id === id); return b ? buildingName(b, c.workplace) : ''; };

function staffItems(c: WfContext): (WfItem & { keys: string })[] {
  if (c.audience === 'business') return []; // the prototype hides the staff for partners
  return c.desks.filter((d) => d.on_duty && d.building).map((d) => ({
    key: 's:' + d.id, kind: 'staff' as const, title: d.name, sub: `${d.title} · on duty 24/7`, buildingId: d.building as BuildingId, action: 'Walk →', group: 'People',
    keys: `${d.name} ${d.title} ${STAFF_KEYS} ${d.id === 'maya' ? MAYA_KEYS : ''}`.toLowerCase(),
  }));
}

function peopleItems(c: WfContext): (WfItem & { keys: string })[] {
  const out: (WfItem & { keys: string })[] = [];
  for (const b of c.buildings) {
    for (const e of c.presence?.[b.id]?.people ?? []) {
      if (!('enrollment_id' in e)) continue;
      out.push({ key: 'p:' + e.enrollment_id, kind: 'person', title: e.display_name, sub: buildingName(b, c.workplace), buildingId: b.id, person: e, action: 'View', group: 'People', keys: e.display_name.toLowerCase() });
    }
  }
  return out;
}

function placeItems(c: WfContext): (WfItem & { keys: string })[] {
  const out: (WfItem & { keys: string })[] = [];
  for (const b of c.buildings) {
    const name = buildingName(b, c.workplace);
    const sub = subOf(b, c.audience, c.workplace) ?? '';
    const bkeys = `${name} ${sub} ${WF_KEYS[b.id] ?? ''}`.toLowerCase();
    out.push({ key: 'b:' + b.id, kind: 'building', title: name, sub, buildingId: b.id, action: walkLabel(c, b.id), group: 'Buildings', keys: bkeys });
    for (const r of b.rooms) {
      if (r.admin || r.planned) continue; // admin tools are not campus places; a room with no page yet has nowhere to go
      const label = roomLabel(r, c.workplace);
      out.push({ key: 'r:' + b.id + ':' + r.route, kind: 'room', title: label, sub: `in ${name}`, buildingId: b.id, route: r.route, action: walkLabel(c, b.id), group: 'Rooms', keys: `${label} ${bkeys} ${r.route}`.toLowerCase() });
    }
  }
  return out;
}

const scoreOf = (it: { title: string; kind: WfKind }, tokens: string[]) => tokens.reduce((s, t) => {
  const label = it.title.toLowerCase();
  return s + (label.startsWith(t) ? 3 : label.includes(t) ? 2 : 1);
}, it.kind === 'building' ? 0.5 : 0);

function urgentItem(c: WfContext): WfItem | null {
  return c.urgent ? { key: 'u', kind: 'urgent', title: c.urgent.title, sub: c.urgent.detail, buildingId: c.urgent.buildingId, run: true, action: 'Run →', group: 'Happening now' } : null;
}

/** The empty Wayfinder: what is happening, what to do next, the staff, then every building. */
export function wayfinderEmpty(c: WfContext): WfItem[] {
  const u = urgentItem(c);
  const sugg = c.suggested.map((s): WfItem => ({ key: 'g:' + s.key, kind: 'suggested', title: s.title, sub: `${s.detail} · ${nameOf(c, s.buildingId)}`, buildingId: s.buildingId, action: walkLabel(c, s.buildingId), group: 'Suggested for you' }));
  const staff = staffItems(c).map(({ keys, ...it }) => ({ ...it, group: 'Staff · always on' }));
  const all = placeItems(c).filter((x) => x.kind === 'building').map(({ keys, ...it }) => ({ ...it, group: 'All buildings' }));
  const help = [bookItem(c)].filter((x): x is WfItem & { keys: string } => !!x).map(({ keys, ...it }) => it);
  return [...(u ? [u] : []), ...sugg, ...staff, ...help, ...all];
}

export function wayfinderSearch(query: string, c: WfContext): WfItem[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return wayfinderEmpty(c);
  const matches = (keys: string) => tokens.every((t) => keys.includes(t));
  const places = placeItems(c).filter((x) => matches(x.keys)).sort((a, b) => scoreOf(b, tokens) - scoreOf(a, tokens)).slice(0, WF_LIMIT);
  const people = [...staffItems(c), ...peopleItems(c)].filter((x) => matches(x.keys)).slice(0, PEOPLE_LIMIT);
  const book = bookItem(c);
  const help = book && matches(book.keys) ? [book] : [];
  const u = urgentItem(c);
  const urgentFirst = u && tokens.some((t) => URGENT_WORDS.includes(t)) ? [u] : [];
  return [...urgentFirst, ...help, ...people, ...places].map(({ keys, ...it }: WfItem & { keys?: string }) => it);
}

export const wfIcon = (it: WfItem): string => (it.kind === 'urgent' ? '⏰' : it.kind === 'book' ? '📅' : BUILDING_ICON[it.buildingId] ?? '');
