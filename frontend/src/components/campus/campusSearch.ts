import type { CampusBuilding } from './campusMap';
import { buildingName, roomLabel } from './campusMap';
import type { CampusPresence, CampusPerson } from './campusApi';

/**
 * "Where to?" search across the campus (Colaberry Campus C3). Pure.
 *
 * Searches the buildings and rooms this viewer can see, plus the people the server already NAMED in
 * live presence (C4). Anonymous presence entries are never searchable, so search cannot reveal anyone
 * the people rail would not. Planned rooms (no route yet) are listed but not navigable.
 */
export type SearchResult =
  | { kind: 'building'; id: string; label: string; buildingId: string }
  | { kind: 'room'; id: string; label: string; buildingId: string; route: string; navigable: boolean; detail: string }
  | { kind: 'person'; id: string; label: string; buildingId: string; detail: string };

export const SEARCH_LIMIT = 8;

const isNamed = (e: unknown): e is CampusPerson => !!e && typeof e === 'object' && !('anonymous' in (e as object));

export function searchCampus(query: string, buildings: CampusBuilding[], presence: CampusPresence | null, workplaceNames: boolean): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hit = (s: string) => s.toLowerCase().includes(q);
  const out: SearchResult[] = [];
  for (const b of buildings) {
    const name = buildingName(b, workplaceNames);
    if (hit(name)) out.push({ kind: 'building', id: 'b:' + b.id, label: name, buildingId: b.id });
    for (const r of b.rooms) {
      if (r.admin) continue; // C6: admin tools are not campus places
      const label = roomLabel(r, workplaceNames);
      if (hit(label) || hit(name)) {
        if (hit(label) || label !== name) out.push({ kind: 'room', id: 'r:' + b.id + ':' + r.route, label, buildingId: b.id, route: r.route, navigable: !r.planned, detail: name });
      }
    }
  }
  if (presence) {
    for (const b of buildings) {
      for (const e of presence[b.id]?.people ?? []) {
        if (isNamed(e) && hit(e.display_name)) out.push({ kind: 'person', id: 'p:' + e.enrollment_id, label: e.display_name, buildingId: b.id, detail: 'In ' + buildingName(b, workplaceNames) });
      }
    }
  }
  // Exact-prefix matches first, then the rest, stable within each group.
  const starts = (r: SearchResult) => (r.label.toLowerCase().startsWith(q) ? 0 : 1);
  return out.map((r, i) => ({ r, i })).sort((a, b) => starts(a.r) - starts(b.r) || a.i - b.i).map((x) => x.r).slice(0, SEARCH_LIMIT);
}
