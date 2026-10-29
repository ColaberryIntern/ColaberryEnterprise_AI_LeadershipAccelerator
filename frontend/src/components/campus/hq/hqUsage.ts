import type { Hq, HqRoom } from './hqModel';

/**
 * C84: which Management Portal rooms this person opens most, so the campus Staff tools card can list their rooms most used
 * first instead of every room a full-access badge opens (Ali, 2026-10-28: "Don't show all if you have a big list like me").
 *
 * A per-viewer convenience, so browser storage: the admin layout records the SIDEBAR ROOM each page belongs to (hqPathFor,
 * never the route, so no record id is stored), and the campus (same origin) reads it. Storage blocked or cleared = no history,
 * and the card falls back to sidebar order; nothing here can throw into a render.
 */
export const USAGE_KEY = 'cm-hq-usage-v1';
export const STAFF_TOOLS_CAP = 6;
const MAX_ROOMS = 200; // a bound on what one browser keeps; far above the sidebar's size

export interface RoomUse { n: number; at: number }
export type HqUsage = Record<string, RoomUse>;

export function readHqUsage(): HqUsage {
  try {
    const raw = window.localStorage.getItem(USAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: HqUsage = {};
    for (const [path, v] of Object.entries(parsed as Record<string, unknown>)) {
      const u = v as Partial<RoomUse> | null;
      if (u && typeof u.n === 'number' && typeof u.at === 'number' && path.startsWith('/admin')) out[path] = { n: u.n, at: u.at };
    }
    return out;
  } catch {
    return {}; // blocked or corrupt storage reads as no history
  }
}

/** One page open in the Management Portal, counted against its sidebar room. */
export function recordHqVisit(path: string | null, now: number = Date.now()): void {
  if (!path) return;
  try {
    const usage = readHqUsage();
    const prev = usage[path];
    usage[path] = { n: (prev?.n ?? 0) + 1, at: now };
    const kept = Object.entries(usage).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_ROOMS);
    window.localStorage.setItem(USAGE_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // storage blocked or full: the card keeps sidebar order, which is the documented fallback
  }
}

/** The rooms this badge opens, most used first (count, then most recent), then sidebar order; capped. Locked rooms never appear. */
export function topRooms(hq: Hq, usage: HqUsage, cap: number = STAFF_TOOLS_CAP): { rooms: HqRoom[]; total: number } {
  const open = hq.floors.flatMap((f) => f.rooms).filter((r) => r.open && !r.external);
  const order = new Map(open.map((r, i) => [r.path, i]));
  const ranked = [...open].sort((a, b) => {
    const ua = usage[a.path]; const ub = usage[b.path];
    if ((ub?.n ?? 0) !== (ua?.n ?? 0)) return (ub?.n ?? 0) - (ua?.n ?? 0);
    if ((ub?.at ?? 0) !== (ua?.at ?? 0)) return (ub?.at ?? 0) - (ua?.at ?? 0);
    return (order.get(a.path) ?? 0) - (order.get(b.path) ?? 0);
  });
  return { rooms: ranked.slice(0, cap), total: open.length };
}

export const hasHistory = (rooms: HqRoom[], usage: HqUsage): boolean => rooms.some((r) => (usage[r.path]?.n ?? 0) > 0);
