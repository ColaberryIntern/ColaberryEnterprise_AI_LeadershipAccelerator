import type { CampusPerson } from './campusApi';
import type { BuildingId, CampusBuilding } from './campusMap';
import { doorOf } from './walkPath';
import type { Pt } from './walkPath';

/**
 * C23 Q1 (DECISIONS.md: "real present people only, never invented walkers"): the classmates walking the campus. The prototype's
 * setupAmbient (D:3227-3245) spawns six random people on random routes; here every walker is a real named person the presence poll
 * listed, standing by the building they are in, and a walk happens only when a later poll lists them somewhere else. Anonymous
 * entries are never drawn (they are not in `shown`), and the viewer is never listed by the server. Pure, so it is unit-tested.
 */
export const WALKERS_MAX = 6; // the prototype's six
export const WALK_SPEED = 48; // world units per second (the prototype's on-foot speed)

export interface WalkerPlace { person: CampusPerson; at: BuildingId; rest: Pt }
type Bld = Pick<CampusBuilding, 'id' | 'kind' | 'pos' | 'zone'>;
type Shown = Partial<Record<string, { shown: CampusPerson[] }>>;

/** Where the n-th walker at a building stands: beside its door, right then left, stepping outward, kept inside the drawn campus. */
export function restSpot(b: Bld, slot: number): Pt {
  const door = doorOf(b);
  const hw = b.kind === 'gate' ? 40 : b.pos.w / 2;
  const side = slot % 2 === 0 ? 1 : -1;
  const x = door.x + side * (hw + 10 + Math.floor(slot / 2) * 14);
  return { x: Math.max(20, Math.min(980, x)), y: b.kind === 'gate' ? door.y : b.pos.y + 4 };
}

/**
 * The walkers to draw: the named people per building, in map order, capped at `max`. People already on the map (`keep`) come first,
 * so a newcomer never bumps someone off mid-walk. A person listed in two buildings is drawn once, at the first.
 */
export function walkerPlan(people: Shown | undefined, buildings: Bld[], max: number = WALKERS_MAX, keep: ReadonlySet<string> = new Set()): WalkerPlace[] {
  if (!people) return [];
  const seen = new Set<string>();
  const all: { person: CampusPerson; b: Bld }[] = [];
  for (const b of buildings) {
    for (const person of people[b.id]?.shown ?? []) {
      if (seen.has(person.enrollment_id)) continue;
      seen.add(person.enrollment_id);
      all.push({ person, b });
    }
  }
  const picked = [...all.filter((w) => keep.has(w.person.enrollment_id)), ...all.filter((w) => !keep.has(w.person.enrollment_id))].slice(0, Math.max(0, max));
  const slots = new Map<string, number>();
  // slots follow map order (not pick order), so where someone stands does not depend on who was kept
  return all.filter((w) => picked.includes(w)).map(({ person, b }) => {
    const slot = slots.get(b.id) ?? 0;
    slots.set(b.id, slot + 1);
    return { person, at: b.id, rest: restSpot(b, slot) };
  });
}

/** A walk's segment lengths and total, for `pointAt`. */
export function track(pts: Pt[]): { lens: number[]; total: number } {
  const lens = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y));
  return { lens, total: lens.reduce((a, v) => a + v, 0) };
}

/** The point `d` world units along a polyline (clamped to its ends). */
export function pointAt(pts: Pt[], lens: number[], d: number): Pt {
  if (!pts.length) return { x: 0, y: 0 };
  let rest = Math.max(0, d), i = 0;
  while (i < lens.length - 1 && rest > lens[i]) { rest -= lens[i]; i++; }
  const a = pts[i], b = pts[i + 1] ?? pts[i], f = lens[i] ? Math.min(1, rest / lens[i]) : 1;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}
