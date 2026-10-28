import type { CampusBuilding } from './campusMap';
import { buildingName, roomLabel } from './campusMap';
import type { CampusPresence, CampusPerson } from './campusApi';
import { means as meansBoard } from './board/boardModel';
import { hqSearch, type Hq } from './hq/hqModel';

const HQ_BUILDING_ID = 'career';

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
  | { kind: 'person'; id: string; label: string; buildingId: string; detail: string }
  | { kind: 'book'; id: string; label: string; buildingId: string; detail: string }
  | { kind: 'board'; id: string; label: string; buildingId: string; detail: string }
  /** Campus HQ (staff): a floor, or a room your badge opens; picking it rides the HQ elevator there. */
  | { kind: 'hq'; id: string; label: string; buildingId: string; detail: string; floor: string };

export const SEARCH_LIMIT = 8;
/** C20 (round 3 §2.7): searches that mean "talk to a person" find "Book a call with admissions". */
export const BOOK_WORDS = ['book', 'call', 'admissions', 'person', 'talk', 'enroll', 'human', 'appointment'];
export const BOOK_RESULT: SearchResult = { kind: 'book', id: 'book', label: 'Book a call with admissions', buildingId: '', detail: 'A real person · 30 minutes on Google Meet' };
export const meansBooking = (q: string): boolean => {
  const t = q.trim().toLowerCase();
  return t.length >= 3 && BOOK_WORDS.some((w) => w.startsWith(t) || t.split(/\s+/).includes(w));
};

/** C30 (v7 R3): "community", "post", "question", "ask", "board" or "forum" offer the Community Board on the Quad. */
export const BOARD_RESULT: SearchResult = { kind: 'board', id: 'board', label: 'Community Board', buildingId: '', detail: 'on the Quad · Walk →' };

const isNamed = (e: unknown): e is CampusPerson => !!e && typeof e === 'object' && !('anonymous' in (e as object));

export function searchCampus(query: string, buildings: CampusBuilding[], presence: CampusPresence | null, workplaceNames: boolean, admissions = false, hq: Hq | null = null): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  if (admissions && meansBooking(q)) return [BOOK_RESULT, ...searchCampus(query, buildings, presence, workplaceNames, false, hq)].slice(0, SEARCH_LIMIT);
  if (meansBoard(q)) return [BOARD_RESULT, ...plainSearch(q, buildings, presence, workplaceNames, hq)].slice(0, SEARCH_LIMIT);
  return plainSearch(q, buildings, presence, workplaceNames, hq);
}

/** Campus HQ: floors by label and the rooms this viewer can open (hqSearch never returns a locked room or a learner's hit). */
function hqResults(q: string, hq: Hq | null): SearchResult[] {
  return hq ? hqSearch(hq, q).map((h) => ({
    kind: 'hq' as const, id: `hq:${h.kind}:${h.floor}:${h.room?.path ?? ''}`, label: h.label, buildingId: HQ_BUILDING_ID, floor: h.floor,
    detail: h.kind === 'floor' ? `HQ · floor ${h.floor}` : `HQ · floor ${h.floor} · ride there`,
  })) : [];
}

function plainSearch(q: string, buildings: CampusBuilding[], presence: CampusPresence | null, workplaceNames: boolean, hq: Hq | null = null): SearchResult[] {
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
  out.push(...hqResults(q, hq));
  // Exact-prefix matches first, then the rest, stable within each group.
  const starts = (r: SearchResult) => (r.label.toLowerCase().startsWith(q) ? 0 : 1);
  return out.map((r, i) => ({ r, i })).sort((a, b) => starts(a.r) - starts(b.r) || a.i - b.i).map((x) => x.r).slice(0, SEARCH_LIMIT);
}
