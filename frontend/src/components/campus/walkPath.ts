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

/** The Main Gate itself (its door is the gate), as opposed to a building whose door joins the path at the gate (C21: Admissions). */
export const isTheGate = (b: Pick<CampusBuilding, 'zone'> & { id?: string }): boolean => b.zone === 'gate' && (b.id === undefined || b.id === 'gate');
type Door = Pick<CampusBuilding, 'pos' | 'zone'> & { id?: string };

/** The door step a building's avatar stands on: just below its ground line (the gate: the gate itself). */
export function doorOf(b: Door): Pt {
  if (isTheGate(b)) return { x: GATE.x, y: GATE.y };
  return { x: b.pos.x, y: b.pos.y + 6 };
}

/** Where you start: on the gate. */
export const START: Here = { x: GATE.x, y: GATE.y, zone: 'gate' };

/** The waypoints from where you are to a building's door (excluding your current point). */
export function routeTo(from: Here, to: Door): Pt[] {
  const door = doorOf(to);
  const spineAve = { x: HUB.x, y: AVE };
  const gate = { x: GATE.x, y: GATE.y };
  // Get from where you are onto the spine (the hub for 'up', the avenue for 'ave', the avenue foot for the gate). C21: from a
  // building beside the gate (its door is not the gate), walk to the gate first.
  const out: Pt[] = [];
  if (from.zone === 'gate' && (from.x !== gate.x || from.y !== gate.y)) out.push(gate);
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
    // a building beside the gate: through the gate to its door (unless you are standing on the gate already); the gate: its door
    const onGate = from.x === gate.x && from.y === gate.y && !out.length;
    if (!isTheGate(to) && !onGate) out.push(gate);
    out.push(door);
  }
  // Drop consecutive duplicates (e.g. already on the avenue at the building's x).
  return out.filter((p, i) => i === 0 || p.x !== out[i - 1].x || p.y !== out[i - 1].y);
}
