import type { CampusBuilding } from './campusMap';
import { buildingName, roomLabel } from './campusMap';

/**
 * The banner trail "Campus > Building > Room" for the current route (Colaberry Campus C3).
 *
 * Matching order (so every room in the catalog gets its full trail):
 *  1. an exact room route wins - this is what makes a room with no building prefix (the staff
 *     "View as" room) read "Campus > Staff Office > View as";
 *  2. otherwise the building with the longest matching prefix ("Campus > Classroom" for
 *     /portal/classroom/week/3), plus the room that page sits inside when one of that building's
 *     rooms is an ancestor path (C129: "Campus > Showcase Gallery > My work" for a work page);
 *  3. otherwise just "Campus".
 * Planned rooms (routes that do not exist yet) never match, because nobody can be on them.
 */
export interface Crumb { label: string; buildingId?: string; route?: string }

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + '/');

export function trailFor(pathname: string, buildings: CampusBuilding[], workplaceNames: boolean): Crumb[] {
  const campus: Crumb = { label: 'Campus' };
  for (const b of buildings) {
    const room = b.rooms.find((r) => !r.planned && !r.admin && r.route === pathname);
    if (room) return [campus, { label: buildingName(b, workplaceNames), buildingId: b.id }, { label: roomLabel(room, workplaceNames), route: room.route }];
  }
  let best: CampusBuilding | null = null;
  let bestLen = -1;
  for (const b of buildings) {
    for (const p of b.prefixes) if (under(pathname, p) && p.length > bestLen) { best = b; bestLen = p.length; }
  }
  if (!best) return [campus];
  const bCrumb: Crumb = { label: buildingName(best, workplaceNames), buildingId: best.id };
  // C129: a page INSIDE a room (a piece's work page, /portal/portfolio/work/:id) keeps the room it belongs to: the room whose
  // route is the longest path prefix of this page. The building's primary room and any room that IS one of the building's own
  // roots ("/portal/portfolio") never claim a deeper page, so this only names a room that is really that page's parent.
  const parent = best.rooms
    .filter((r) => !r.planned && !r.admin && r.route !== best!.primary.route && !best!.prefixes.includes(r.route) && under(pathname, r.route))
    .sort((a, c) => c.route.length - a.route.length)[0];
  return parent ? [campus, bCrumb, { label: roomLabel(parent, workplaceNames), route: parent.route }] : [campus, bCrumb];
}

/** The building the learner is in, by the same rules (used by Step outside). */
export function buildingIdForPath(pathname: string, buildings: CampusBuilding[]): string | null {
  return trailFor(pathname, buildings, false)[1]?.buildingId ?? null;
}
