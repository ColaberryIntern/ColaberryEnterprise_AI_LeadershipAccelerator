import { Op } from 'sequelize';
import CampusPresence from '../../models/CampusPresence';
import { ensureCampusPresenceSchema } from '../../db/ensureCampusPresenceSchema';
import { env } from '../../config/env';
import { getPeoplePanel } from '../peoplePanelService';
import { getCohortPresence } from '../cohortPresenceService';
import { isCampusArea, CampusArea } from './campusAreas';
import { canDmMany } from '../communityRooms/dmEligibility';
import { campusAudienceFor } from './campusAudience';
import { teamEnrollmentIdsFor } from './campusTeam';
import { looksFor } from './campusLookService';

/**
 * Who is in each campus building right now (Colaberry Campus C4).
 *
 * VISIBILITY PARITY, BY CONSTRUCTION. The campus may name a person only if the portal's people
 * rail names them for this viewer. So the named set is computed by the rail's OWN function for
 * this viewer, under the same switch the rail route uses (PEOPLE_PANEL_ROLES_ENABLED): the role
 * panel (staff: online; student: my class + active now) or, with the flag off, cohort presence.
 * Everyone else present is returned as exactly { anonymous: true }: no id, no name, no avatar.
 * A named person is reduced to three fields in both modes, so nothing the rail lacks is added.
 *
 * Disclosed (PR and ticket): counts include people from other cohorts (never named), and a named
 * person's building is new information compared with the rail's online dot.
 *
 * COST. The rail function runs at most once per viewer per minute: results are cached for 60 s
 * (the rail's own refresh cadence), keyed on enrollment AND cohort, in a Map capped at 2,000
 * viewers (oldest evicted). Presence rows are bounded by the 90 s window and LIMIT 500.
 *
 * BUSINESS SEES ITS TEAM ONLY (C6). For a viewer whose campus audience is business (an org manager), the named set is the
 * rail's set INTERSECTED with the organization they manage (campusTeam.ts, the existing manages rule). The campus therefore
 * still never names anyone the rail would not, and names only teammates. A failed team lookup names nobody (fail closed) and
 * is logged. Cached with the rest of the visible set (60 s per viewer and cohort).
 *
 * CAN MESSAGE (C5). Each named person carries can_message, decided by the ONE DM rule (dmEligibility, the same
 * check POST /api/portal/dm/open makes), per viewer, on output only: it is never stored in the shared visible-set
 * cache. A failed lookup makes every named person can_message false (fail closed) and is logged. Disclosed: for a
 * person the rail already names, it reveals whether you may message them (for an "active now" student, whether they
 * share your cohort), which clicking Message in the rail already reveals today.
 *
 * FAILURE. Any error (including the first-create race in ensureCampusPresenceSchema) propagates
 * to the route as a 500, and the UI shows "We can't load who's online" - never an empty campus.
 */

export const FRESH_MS = 90_000;
export const ROW_LIMIT = 500;
export const VISIBLE_TTL_MS = 60_000;
export const VISIBLE_CACHE_MAX = 2_000;

export interface CampusPerson { enrollment_id: string; display_name: string; avatar_url: string | null }
/** C9: the person's level (band rung) and the gear others may see (never a ride). Absent when the look read failed. */
export interface CampusPersonOut extends CampusPerson {
  can_message: boolean;
  rung_name?: string;
  gear?: Partial<Record<'head' | 'face' | 'body' | 'neck', string>>;
}
export type CampusPresenceEntry = CampusPersonOut | { anonymous: true };
export interface CampusPresenceAreas { areas: Partial<Record<CampusArea, { count: number; people: CampusPresenceEntry[] }>> }

export class CampusAreaError extends Error {
  readonly error_class = 'UnknownCampusArea';
  constructor(area: unknown) { super(`Unknown campus area: ${String(area).slice(0, 40)}`); this.name = 'CampusAreaError'; }
}

/** Record that this learner is in `area` now. Unknown area: throws before any database call. */
export async function touchCampusArea(enrollmentId: string, area: unknown): Promise<void> {
  if (!isCampusArea(area)) throw new CampusAreaError(area);
  await ensureCampusPresenceSchema();
  await CampusPresence.upsert({ enrollment_id: enrollmentId, area, updated_at: new Date() });
}

/**
 * WP-7 (decision Q14, "Show which building I'm in" off): forget where this learner is, so no building counts them. Classmates still
 * see them online through the community heartbeat, which this does not touch. Idempotent: clearing twice leaves the same state.
 */
export async function clearCampusArea(enrollmentId: string): Promise<void> {
  await ensureCampusPresenceSchema();
  await CampusPresence.destroy({ where: { enrollment_id: enrollmentId } });
}

const pick = (enrollment_id: string, display_name: string, avatar_url: string | null | undefined): CampusPerson =>
  ({ enrollment_id, display_name, avatar_url: avatar_url ?? null });

/** C6: a business viewer keeps only their team; everyone else keeps the rail's set unchanged. */
async function limitToTeam(viewer: string, rail: Map<string, CampusPerson>): Promise<Map<string, CampusPerson>> {
  if (!rail.size || (await campusAudienceFor(viewer)) !== 'business') return rail;
  try {
    const team = await teamEnrollmentIdsFor(viewer);
    return new Map(Array.from(rail).filter(([id]) => team.has(id)));
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'campus_team_lookup_failed', outcome: 'failure',
      error_class: e?.name || 'Error', context: { message: String(e?.message || err).slice(0, 200) } }));
    return new Map();
  }
}

/** The people this viewer may see by name: the rail's own set (business viewers: only their team). */
async function computeVisible(viewer: string, cohort: string | null): Promise<Map<string, CampusPerson>> {
  return limitToTeam(viewer, await railVisible(viewer, cohort));
}

/** The people the rail names for this viewer, from the rail's own source. */
async function railVisible(viewer: string, cohort: string | null): Promise<Map<string, CampusPerson>> {
  const out = new Map<string, CampusPerson>();
  if (env.peoplePanelRolesEnabled) {
    const panel = await getPeoplePanel(viewer, cohort);
    const list = panel.viewer_role === 'staff' ? panel.online : [...panel.my_class, ...panel.active_now];
    for (const p of list) out.set(p.enrollment_id, pick(p.enrollment_id, p.display_name, p.avatar_url));
  } else {
    for (const c of await getCohortPresence(viewer, cohort)) out.set(c.id, pick(c.id, c.name, c.avatarUrl));
  }
  return out;
}

const visibleCache = new Map<string, { at: number; people: Map<string, CampusPerson> }>();

export async function visibleSetFor(viewer: string, cohort: string | null, now: Date = new Date()): Promise<Map<string, CampusPerson>> {
  const key = `${viewer}|${cohort ?? ''}`;
  const hit = visibleCache.get(key);
  if (hit && now.getTime() - hit.at < VISIBLE_TTL_MS) return hit.people;
  const people = await computeVisible(viewer, cohort);
  visibleCache.delete(key);
  visibleCache.set(key, { at: now.getTime(), people });
  while (visibleCache.size > VISIBLE_CACHE_MAX) visibleCache.delete(visibleCache.keys().next().value as string);
  return people;
}

/** Test seams. */
export function __resetCampusPresenceCacheForTests(): void { visibleCache.clear(); }
export function __campusPresenceCacheSize(): number { return visibleCache.size; }

export async function getCampusPresence(viewer: string, cohort: string | null, now: Date = new Date()): Promise<CampusPresenceAreas> {
  await ensureCampusPresenceSchema();
  const since = new Date(now.getTime() - FRESH_MS);
  const rows = (await CampusPresence.findAll({
    where: { updated_at: { [Op.gte]: since } },
    attributes: ['enrollment_id', 'area', 'updated_at'],
    order: [['updated_at', 'DESC']],
    limit: ROW_LIMIT,
    raw: true,
  })) as unknown as Array<{ enrollment_id: string; area: string; updated_at: Date | string }>;
  const visible = await visibleSetFor(viewer, cohort, now);
  const areas: CampusPresenceAreas['areas'] = {};
  for (const r of rows) {
    if (new Date(r.updated_at).getTime() < since.getTime()) continue; // defensive: the query already bounds it
    if (!isCampusArea(r.area)) continue; // a retired building id is ignored, not shown
    const slot = areas[r.area] ?? (areas[r.area] = { count: 0, people: [] });
    slot.count += 1;
    if (r.enrollment_id === viewer) continue; // you are counted, not listed
    const named = visible.get(r.enrollment_id);
    slot.people.push(named ? { ...named, can_message: false } : { anonymous: true });
  }
  await markCanMessage(viewer, cohort, areas);
  await markLook(areas);
  return { areas };
}

/**
 * C9: level and public gear on every NAMED entry, in place (anonymous entries are never touched). One cached batch
 * (campusLookService.looksFor, 60 s); it never throws, and a person it could not read simply has no level or gear.
 */
async function markLook(areas: CampusPresenceAreas['areas']): Promise<void> {
  const named = Object.values(areas).flatMap((a) => (a ? a.people : [])).filter((p): p is CampusPersonOut => !('anonymous' in p));
  if (!named.length) return;
  const looks = await looksFor(Array.from(new Set(named.map((p) => p.enrollment_id))));
  for (const p of named) {
    const l = looks.get(p.enrollment_id);
    if (l?.rung_name) p.rung_name = l.rung_name;
    if (l?.gear) p.gear = l.gear;
  }
}

/** Sets can_message on every named entry in place. One batched lookup; any failure leaves them all false. */
async function markCanMessage(viewer: string, cohort: string | null, areas: CampusPresenceAreas['areas']): Promise<void> {
  const named = Object.values(areas).flatMap((a) => (a ? a.people : [])).filter((p): p is CampusPersonOut => !('anonymous' in p));
  if (!named.length) return;
  try {
    const ok = await canDmMany(viewer, cohort, Array.from(new Set(named.map((p) => p.enrollment_id))));
    for (const p of named) p.can_message = ok.get(p.enrollment_id) === true;
  } catch (err: any) {
    console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'campus_can_message_failed', outcome: 'failure',
      error_class: err?.name || 'Error', context: { named: named.length, message: String(err?.message || err).slice(0, 200) } }));
  }
}
