import type { BuildingId, CampusAudience, CampusBuilding } from './campusMap';
import type { Happening } from './BuildingCard';

/**
 * What the arrival panel says about a building (C11b; WP-2), as pure data: the hero's kicker and one-line description, and
 * "Happening here", built only from what the campus really knows (broadcast discovery, live presence, and the portal facts in
 * campusFacts). With nothing true to say it says the building is quiet, never an invented event. Today's plan has its own box in
 * the panel now (PlanBox), so it is not repeated here.
 */

/** The prototype's place names (arrive(): "North campus", "South avenue", the Business District; Workplace: "North side", "Main street"). */
const DISTRICT = new Set(['studio', 'gallery', 'career']);
export function zoneLabelOf(b: Pick<CampusBuilding, 'zone' | 'id'>, workplace = false): string | undefined {
  if (b.zone === 'gate') return undefined;
  if (DISTRICT.has(b.id)) return 'Business District';
  if (workplace) return b.zone === 'ave' ? 'Main street' : 'North side';
  return b.zone === 'ave' ? 'South avenue' : 'North campus';
}

/**
 * Each building's one line under its name (the prototype's `sub`, B and DISTRICT D:1449-1521; Workplace WORKNAMES D:1523). Where
 * the prototype's line names something this build does not have, the line says what the building really holds.
 */
const SUB: Partial<Record<BuildingId, [string, string | null]>> = {
  lecture: ['Classroom, live sessions & check-in', 'Live sessions & training'],
  library: ['Curriculum, lessons & reference', 'Playbooks, curriculum & docs'],
  tower: ['Your schedule & today’s agenda', 'Your schedule & agenda'],
  studio: ['Sprint board, tickets & builds', null],
  amphi: ['Events, open houses & demos', 'Town halls, events & demos'],
  testing: ['Cert prep & knowledge checks', 'Skill verification & knowledge checks'],
  observatory: ['Your path, progress & points', 'Growth path, progress & points'],
  commons: ['Community, people & live rooms', 'Colleagues, coffee & live rooms'],
  gallery: ['Portfolio & client demos', null],
  career: ['Engagements, internship & company work', null],
  arcade: ['Three quick games · 15 min a day', null],
  gate: ['The way in, and the welcome desk', null],
};
/** The career building changes face per account (campusMap.careerBuildingFor); its line follows the face. */
const CAREER_FACE: Partial<Record<CampusAudience, string>> = {
  business: 'Your company, team & invites',
  staff: 'Management Portal, handoffs & people',
};
export function subOf(b: Pick<CampusBuilding, 'id'>, audience: CampusAudience, workplace = false): string | null {
  if (b.id === 'career' && CAREER_FACE[audience]) return CAREER_FACE[audience]!;
  const s = SUB[b.id];
  return s ? (workplace && s[1]) || s[0] : null;
}

/** The hero's kicker for this arrival (the prototype changes it during a tour, and for an Explorer at a building not open to them). */
export function kickerOf(o: { zone?: string; tour?: { name: string; n: number; of: number } | null; access?: string; audience?: string }): string {
  if (o.tour) return `${o.tour.name} · stop ${o.tour.n} of ${o.tour.of}`;
  if (o.access === 'locked') return '🔒 Members only · you can look inside';
  if (o.audience === 'explorer' && o.access === 'demo') return 'Demo mode · look around';
  if (o.audience === 'explorer' && o.access === 'preview') return 'Preview · watch a short sample';
  if (o.audience === 'business') return 'Partner view';
  return `You’ve arrived${o.zone ? ` · ${o.zone}` : ''}`;
}

export function happeningAt(id: BuildingId, s: { onAir: boolean; count: number | null; presenceError: boolean; facts?: Happening[]; live?: { state: string; title: string; sub: string } | null }): Happening[] {
  const out: Happening[] = [];
  // WP-6: the prototype's per-state rows (its "reactions are flowing" and "your cohort is arriving" were samples, not drawn)
  if (s.live?.state === 'reconnecting') out.push({ title: 'Reconnecting to the stream', detail: 'Resumes automatically, nothing to refresh', tone: '' });
  else if (s.live) out.push({ title: `On air · ${s.live.title}`, detail: s.live.sub, tone: 'hot' });
  else if (s.onAir) out.push({ title: 'On air now', detail: 'Colaberry Live is broadcasting here', tone: 'hot' });
  out.push(...(s.facts ?? []));
  if (s.presenceError) out.push({ title: 'Who is here is unavailable', detail: 'Headcounts are hidden, not zero', tone: '' });
  else if (s.count && s.count > 0) out.push({ title: `${s.count} ${s.count === 1 ? 'person' : 'people'} here now`, detail: 'From live presence', tone: 'live' });
  if (!out.length) out.push({ title: 'Quiet right now', detail: id === 'gate' ? 'The way in and out of campus' : 'Nobody is here at the moment', tone: '' });
  return out;
}
