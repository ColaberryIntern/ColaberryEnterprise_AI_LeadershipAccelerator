import type { CampusBuilding } from './campusMap';
import { HUB, AVE, GATE } from './art/grounds';

/**
 * Where the avatar walks, along the prototype's paths (entryOf in docs/design/campus/colaberry-campus.html): upper buildings
 * join the hub by the fountain, lower buildings join the avenue (y = 592), and the gate sits at the end of the spine. Pure, so
 * the route is unit-tested without a browser.
 */
export type Pt = { x: number; y: number };
/** 'ground': standing on the grass after a click-to-walk (C17); a walk from there goes onto the paths first (walkGraph.routeFrom). */
export type Zone = 'up' | 'ave' | 'gate' | 'ground';
export interface Here extends Pt { zone: Zone }

/** The door step a building's avatar stands on: just below its ground line (the gate: the gate itself). */
export function doorOf(b: Pick<CampusBuilding, 'pos' | 'zone'>): Pt {
  if (b.zone === 'gate') return { x: GATE.x, y: GATE.y };
  return { x: b.pos.x, y: b.pos.y + 6 };
}

/** Where you start: on the gate. */
export const START: Here = { x: GATE.x, y: GATE.y, zone: 'gate' };

/** The waypoints from where you are to a building's door (excluding your current point). */
export function routeTo(from: Here, to: Pick<CampusBuilding, 'pos' | 'zone'>): Pt[] {
  const door = doorOf(to);
  const spineAve = { x: HUB.x, y: AVE };
  // Get from where you are onto the spine (the hub for 'up', the avenue for 'ave', the avenue foot for the gate).
  const out: Pt[] = [];
  if (from.zone === 'up') out.push(HUB);
  if (from.zone === 'ave') out.push({ x: from.x, y: AVE });
  if (to.zone === 'up') {
    if (from.zone !== 'up') out.push(spineAve, HUB);
    out.push(door);
  } else if (to.zone === 'ave') {
    if (from.zone === 'up' || from.zone === 'gate') out.push(spineAve);
    out.push({ x: door.x, y: AVE }, door);
  } else {
    if (from.zone !== 'gate') out.push(spineAve);
    out.push(door);
  }
  // Drop consecutive duplicates (e.g. already on the avenue at the building's x).
  return out.filter((p, i) => i === 0 || p.x !== out[i - 1].x || p.y !== out[i - 1].y);
}
