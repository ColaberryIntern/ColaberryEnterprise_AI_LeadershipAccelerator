import type { Hallway, HallwayBooking, HallwayPerson, HallwayRoom } from './hallwayApi';

/**
 * The hallway's rules (C29, v7 R2), pure so each is tested. The prototype's MROOMS are illustrative; every door here is a real room:
 *  - a door per live room (someone inside), per upcoming booking of yours, then your own idle rooms ("Free");
 *  - order: live rooms with a friend inside, other live rooms, your bookings (soonest first), free rooms;
 *  - at most six doors (three per side wall); with more, the sixth is "More rooms →" (the full list on /portal/rooms).
 */
export const MAX_DOORS = 6;
export const TZ = 'America/Chicago';
export type DoorState = 'live' | 'booked' | 'free';
export interface Door {
  more: false; n: number; key: string; roomId: string; name: string; sub: string; emoji: string | null;
  state: DoorState; insideCount: number; inside: HallwayPerson[]; friends: boolean; booking: HallwayBooking | null;
}
export interface MoreDoor { more: true; n: number; key: 'more'; hidden: number }
export type AnyDoor = Door | MoreDoor;

const door = (r: HallwayRoom, state: DoorState, booking: HallwayBooking | null): Omit<Door, 'n'> => ({
  more: false, key: booking ? `b-${booking.booking_id}` : `r-${r.room_id}`, roomId: r.room_id, name: booking && state === 'booked' ? booking.title : r.name,
  sub: r.sub, emoji: r.emoji, state, insideCount: r.inside_count, inside: r.inside, friends: r.inside.some((p) => p.friend), booking,
});

/** Every door in hallway order, uncapped. */
export function orderedDoors(h: Hallway): Omit<Door, 'n'>[] {
  const byId = new Map(h.rooms.map((r) => [r.room_id, r]));
  const live = h.rooms.filter((r) => r.inside_count > 0).sort((a, b) => b.inside_count - a.inside_count);
  const liveIds = new Set(live.map((r) => r.room_id));
  const firstBooking = new Map<string, HallwayBooking>();
  for (const b of [...h.bookings].sort((a, c) => a.start_at.localeCompare(c.start_at))) if (!firstBooking.has(b.room_id)) firstBooking.set(b.room_id, b);
  const booked = Array.from(firstBooking.values()).filter((b) => !liveIds.has(b.room_id) && byId.has(b.room_id));
  const bookedIds = new Set(booked.map((b) => b.room_id));
  const free = h.rooms.filter((r) => r.mine && !liveIds.has(r.room_id) && !bookedIds.has(r.room_id));
  const liveDoors = live.map((r) => door(r, 'live', firstBooking.get(r.room_id) ?? null));
  return [
    ...liveDoors.filter((d) => d.friends), ...liveDoors.filter((d) => !d.friends),
    ...booked.map((b) => door(byId.get(b.room_id)!, 'booked', b)), ...free.map((r) => door(r, 'free', null)),
  ];
}

/** The doors on the walls: at most six, the sixth "More rooms →" when there are more. Numbered 1-6 (left wall 1-3, right 4-6). */
export function hallwayDoors(h: Hallway, max = MAX_DOORS): AnyDoor[] {
  const all = orderedDoors(h);
  if (all.length <= max) return all.map((d, i) => ({ ...d, n: i + 1 }));
  const shown: AnyDoor[] = all.slice(0, max - 1).map((d, i) => ({ ...d, n: i + 1 }));
  shown.push({ more: true, n: max, key: 'more', hidden: all.length - (max - 1) });
  return shown;
}

/** Live rooms, for the board's "n OPEN NOW" and its rows. */
export const liveRooms = (h: Hallway): Omit<Door, 'n'>[] => orderedDoors(h).filter((d) => d.state === 'live');

/** "Tue 10:30 AM" in Central. */
export function centralWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' })} ${d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })}`;
}

/** The door sign's state line: "● 3 inside", "Booked · Tue 10:30 AM" or "Free". */
export function doorSign(d: Door): string {
  if (d.state === 'live') return `● ${d.insideCount} inside`;
  if (d.state === 'booked' && d.booking) return `Booked · ${centralWhen(d.booking.start_at)}`;
  return 'Free';
}

/** The arrival card row's line: "3 inside · sub", "Booked · Tue 10:30 AM" or "Free". */
export function rowLine(d: Door): string {
  if (d.state === 'live') return [`${d.insideCount} inside`, d.sub].filter(Boolean).join(' · ');
  return doorSign(d);
}

export const initialsOf = (name: string): string => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
export const firstNameOf = (name: string): string => name.trim().split(/\s+/)[0] || name;

/** The prototype's SLOTS: Central wall-clock times the Book a session sheet offers. */
export const SLOTS = ['9:00 AM', '9:30 AM', '10:30 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:30 PM', '4:30 PM'];
export const SESSION_MINUTES = 60;

/** Central date parts of an instant. */
function centralYmd(at: Date): { y: number; m: number; d: number; wd: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' })
    .formatToParts(at).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}

export interface BookDay { key: string; wd: string; d: number; mon: string }
/** The next seven business days (Mon-Fri) in Central, starting tomorrow (the prototype's bookDays). */
export function bookDays(now: Date): BookDay[] {
  const out: BookDay[] = [];
  const start = centralYmd(now);
  for (let i = 1; out.length < 7 && i < 15; i++) {
    const noon = new Date(Date.UTC(start.y, start.m - 1, start.d + i, 18)); // 18:00 UTC is midday in Central all year
    const c = centralYmd(noon);
    if (c.wd === 0 || c.wd === 6) continue;
    out.push({ key: `${c.y}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`, wd: noon.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' }), d: c.d,
      mon: noon.toLocaleDateString('en-US', { timeZone: TZ, month: 'short' }) });
  }
  return out;
}

/** The instant of a Central wall-clock time ("2026-10-27", "10:30 AM"), DST-correct. */
export function centralSlotIso(dayKey: string, slot: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const mt = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(slot);
  if (!mt) throw new Error(`bad slot ${slot}`);
  const h = (Number(mt[1]) % 12) + (mt[3] === 'PM' ? 12 : 0);
  const want = Date.UTC(y, m - 1, d, h, Number(mt[2]));
  let guess = want + 6 * 3600_000; // Central is UTC-5 or UTC-6; correct once from the zone's own clock
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
    const shown = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
    guess += want - shown;
  }
  return new Date(guess).toISOString();
}
