import type { CampusBuilding } from './campusMap';
import { buildingName } from './campusMap';

/**
 * The banner trail "Campus > Building > Room" for the current route (Colaberry Campus C3).
 *
 * Matching order (so every room in the catalog gets its full trail):
 *  1. an exact room route wins - this is what makes a room with no building prefix (the staff
 *     "View as" room) read "Campus > Staff Office > View as";
 *  2. otherwise the building with the longest matching prefix ("Campus > Classroom" for
 *     /portal/classroom/week/3);
 *  3. otherwise just "Campus".
 * Planned rooms (routes that do not exist yet) never match, because nobody can be on them.
 */
export interface Crumb { label: string; buildingId?: string; route?: string }

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + '/');

export function trailFor(pathname: string, buildings: CampusBuilding[], workplaceNames: boolean): Crumb[] {
  const campus: Crumb = { label: 'Campus' };
  for (const b of buildings) {
    const room = b.rooms.find((r) => !r.planned && !r.admin && r.route === pathname);
    if (room) return [campus, { label: buildingName(b, workplaceNames), buildingId: b.id }, { label: room.label, route: room.route }];
  }
  let best: CampusBuilding | null = null;
  let bestLen = -1;
  for (const b of buildings) {
    for (const p of b.prefixes) if (under(pathname, p) && p.length > bestLen) { best = b; bestLen = p.length; }
  }
  return best ? [campus, { label: buildingName(best, workplaceNames), buildingId: best.id }] : [campus];
}

/** The building the learner is in, by the same rules (used by Step outside). */
export function buildingIdForPath(pathname: string, buildings: CampusBuilding[]): string | null {
  return trailFor(pathname, buildings, false)[1]?.buildingId ?? null;
}
