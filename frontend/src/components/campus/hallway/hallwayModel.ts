import type { Hallway, HallwayBooking, HallwayPerson, HallwayRoom, HallwayRoomSession } from './hallwayApi';

/**
 * The hallway's rules (C29, v7 R2), pure so each is tested. The prototype's MROOMS are illustrative; every door here is a real room:
 *  - a door per room with a meeting running, per room with people in it, per upcoming booking of yours, then your own idle rooms;
 *  - order: live rooms with a friend inside, other live rooms, occupied rooms, your bookings (soonest first), your idle rooms;
 *  - at most six doors (three per side wall); with more, the sixth is "More rooms →" (the full list on /portal/rooms).
 *
 * LIVE AND OCCUPIED ARE DIFFERENT THINGS, and conflating them is the defect this file
 * carried. A door was "live" when `inside_count > 0`, and that number counts people
 * with the room's PAGE open in the last 70 seconds — not people in the call. So the
 * board read "2 open now" for two idle browser tabs, and a real Zoom call with
 * everyone off the website read as closed. `live_since` is the only field here that
 * means a meeting is actually happening; `inside_count` is still shown, under a label
 * that says what it counts.
 */
export const MAX_DOORS = 6;
export const TZ = 'America/Chicago';
/**
 * `live` = a meeting is running. `in_session` = the timetable says one is due here.
 * `occupied` = people are here, no call and nothing scheduled.
 *
 * THREE SOURCES, THREE STATES, in that order of authority. A started call outranks a
 * timetable entry, because it is the thing actually happening; a timetable entry
 * outranks a count of open browser tabs, because it says WHAT is happening and names
 * it. Before `in_session` existed the schedule could not reach the door at all.
 */
export type DoorState = 'live' | 'in_session' | 'occupied' | 'booked' | 'idle';
export interface Door {
  more: false; n: number; key: string; roomId: string; name: string; sub: string; emoji: string | null;
  state: DoorState; insideCount: number; inside: HallwayPerson[]; friends: boolean; booking: HallwayBooking | null;
  /** The scheduled session, carried so the sign can name it rather than say "in session". */
  session: HallwayRoomSession | null;
}
export interface MoreDoor { more: true; n: number; key: 'more'; hidden: number }
export type AnyDoor = Door | MoreDoor;
/** C44: a filler door on the wall, "Room <n> - Empty - open it": it opens the New room sheet and invents no room, people or booking. */
export interface EmptyDoor { empty: true; n: number; key: string }
export type WallDoor = AnyDoor | EmptyDoor;
export const isEmptyDoor = (d: WallDoor): d is EmptyDoor => 'empty' in d;

const door = (r: HallwayRoom, state: DoorState, booking: HallwayBooking | null): Omit<Door, 'n'> => ({
  more: false, key: booking ? `b-${booking.booking_id}` : `r-${r.room_id}`, roomId: r.room_id, name: booking && state === 'booked' ? booking.title : r.name,
  sub: r.sub, emoji: r.emoji, state, insideCount: r.inside_count, inside: r.inside, friends: r.inside.some((p) => p.friend), booking,
  session: r.session ?? null,
});

/** Every door in hallway order, uncapped. */
export function orderedDoors(h: Hallway): Omit<Door, 'n'>[] {
  const byId = new Map(h.rooms.map((r) => [r.room_id, r]));
  // A meeting running outranks a busy page. A room can be live with nobody on the
  // website at all, which is the normal shape of a real call.
  const live = h.rooms.filter((r) => !!r.live_since).sort((a, b) => b.inside_count - a.inside_count);
  const liveIds = new Set(live.map((r) => r.room_id));
  // Then the timetable. A scheduled session outranks a count of open tabs because it
  // names what is happening; it loses to a started call because that is happening.
  // Sorted by start, so the session beginning soonest reads first.
  const inSession = h.rooms.filter((r) => !liveIds.has(r.room_id) && !!r.session)
    .sort((a, b) => (a.session!.start_at).localeCompare(b.session!.start_at));
  const sessionIds = new Set(inSession.map((r) => r.room_id));
  const occupied = h.rooms.filter((r) => !liveIds.has(r.room_id) && !sessionIds.has(r.room_id) && r.inside_count > 0).sort((a, b) => b.inside_count - a.inside_count);
  const shownIds = new Set([...liveIds, ...sessionIds, ...occupied.map((r) => r.room_id)]);
  const firstBooking = new Map<string, HallwayBooking>();
  for (const b of [...h.bookings].sort((a, c) => a.start_at.localeCompare(c.start_at))) if (!firstBooking.has(b.room_id)) firstBooking.set(b.room_id, b);
  const booked = Array.from(firstBooking.values()).filter((b) => !shownIds.has(b.room_id) && byId.has(b.room_id));
  const bookedIds = new Set(booked.map((b) => b.room_id));
  const idle = h.rooms.filter((r) => r.mine && !shownIds.has(r.room_id) && !bookedIds.has(r.room_id));
  const liveDoors = live.map((r) => door(r, 'live', firstBooking.get(r.room_id) ?? null));
  // Friends-first applies WITHIN each tier, not just to live rooms. Splitting rooms
  // into live and occupied would otherwise silently drop the rule for every room that
  // has people but no call, which before this change was all of them.
  const sessionDoors = inSession.map((r) => door(r, 'in_session', firstBooking.get(r.room_id) ?? null));
  const occupiedDoors = occupied.map((r) => door(r, 'occupied', firstBooking.get(r.room_id) ?? null));
  return [
    ...liveDoors.filter((d) => d.friends), ...liveDoors.filter((d) => !d.friends),
    ...sessionDoors.filter((d) => d.friends), ...sessionDoors.filter((d) => !d.friends),
    ...occupiedDoors.filter((d) => d.friends), ...occupiedDoors.filter((d) => !d.friends),
    ...booked.map((b) => door(byId.get(b.room_id)!, 'booked', b)), ...idle.map((r) => door(r, 'idle', null)),
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

/** C44 (room fix F4): the walls always show six doors (1-3 left, 4-6 right): the real doors in hallway order (with More rooms when
 *  there are more than six), then empty filler doors up to six. The arrival card's rows and the sheet keep using hallwayDoors. */
export function wallDoors(h: Hallway, max = MAX_DOORS): WallDoor[] {
  const real: WallDoor[] = hallwayDoors(h, max);
  for (let n = real.length + 1; n <= max; n += 1) real.push({ empty: true, n, key: `empty-${n}` });
  return real;
}

/** Rooms with a meeting actually running. */
export const liveRooms = (h: Hallway): Omit<Door, 'n'>[] => orderedDoors(h).filter((d) => d.state === 'live');

/** A meeting is running or the timetable has one due: the room people were told to be in. */
const isEventDoor = (d: Pick<Door, 'state'>): boolean => d.state === 'live' || d.state === 'in_session';

/**
 * Rooms worth a row on the board: a meeting is running, one is scheduled, or people are present.
 *
 * ONE EVENT, ONE JOIN (2026-11-13, AI Friday). While a session is live or due, the
 * board lists only those rooms. Listing an occupied side room ("Help Session") with
 * its own red Join next to the event made people ask which one was the class.
 */
export function boardRooms(h: Hallway): Omit<Door, 'n'>[] {
  const rows = orderedDoors(h).filter((d) => isEventDoor(d) || d.state === 'occupied');
  return rows.some(isEventDoor) ? rows.filter(isEventDoor) : rows;
}

/** True while any room has a meeting running or a session due. */
export const eventInProgress = (h: Hallway): boolean => orderedDoors(h).some(isEventDoor);

/**
 * Should THIS row carry a Join button, given everything else in the hallway? While an
 * event is on, only its room does; an occupied side room keeps its row but loses
 * the competing button (its door still opens it). See boardRooms.
 */
export const showJoin = (d: Pick<Door, 'state'>, eventOn: boolean): boolean =>
  canJoin(d) && (!eventOn || isEventDoor(d));

/** Rooms the timetable has claimed, soonest first. */
export const sessionRooms = (h: Hallway): Omit<Door, 'n'>[] =>
  orderedDoors(h).filter((d) => d.state === 'in_session');

/**
 * Is there anyone to walk in on?
 *
 * Named once because splitting `live` in two nearly removed the Join button from
 * every room that has people in it but no call running — which, until the Zoom
 * subscription is configured, is every room. "A meeting is on" gates the live DOT;
 * "somebody is there" gates the door.
 *
 * `in_session` joins that list for the same reason, and it is the case that matters
 * most: a scheduled session with nobody there yet is precisely when a person needs
 * the button. Adding a state without adding it here is how the button silently
 * disappears from the room everyone was told to be in.
 */
export const canJoin = (d: Pick<Door, 'state'>): boolean =>
  d.state === 'live' || d.state === 'in_session' || d.state === 'occupied';

/**
 * The board's heading.
 *
 * Says "live now" only when a meeting is genuinely running. With no call anywhere it
 * reports the people who are present, which is what the number always actually
 * measured, under a label that admits it. The heading never claims a call that nobody
 * started — the whole complaint this replaces.
 */
export function boardSummary(h: Hallway): { count: number; label: string } {
  const liveCount = liveRooms(h).length;
  if (liveCount > 0) return { count: liveCount, label: liveCount === 1 ? 'room live now' : 'rooms live now' };
  // Then the timetable, which is a real answer and not a claim about a call: it says a
  // session is due, which is what someone arriving at 8:50 came to find out. Reporting
  // the tab count instead was how the board said "2 open now" with nothing happening.
  const sessions = sessionRooms(h).length;
  if (sessions > 0) return { count: sessions, label: sessions === 1 ? 'session scheduled now' : 'sessions scheduled now' };
  const here = orderedDoors(h).filter((d) => d.state === 'occupied').reduce((n, d) => n + d.insideCount, 0);
  if (here > 0) return { count: here, label: here === 1 ? 'person here' : 'people here' };
  return { count: 0, label: 'rooms live now' };
}

/** "Tue 10:30 AM" in Central. */
export function centralWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' })} ${d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })}`;
}

/** "9:00 AM" in Central. Time only, because a session's door is read on its own day. */
export function centralTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
}

/** The door sign's state line: "● Live · 3 here", "◆ In session", "3 here", "Booked · Tue 10:30 AM" or "Available". */
export function doorSign(d: Door): string {
  // "inside" was the old word and it overclaimed: it described an open browser tab as
  // being in the room. A live meeting gets the dot; presence gets a plain count.
  if (d.state === 'live') return d.insideCount > 0 ? `● Live · ${d.insideCount} here` : '● Live now';
  if (d.state === 'in_session' && d.session) {
    // A DIFFERENT marker from live, deliberately. The diamond says the clock claims this
    // room; the filled dot says a call is running. One glyph for both would re-create
    // exactly the ambiguity this work set out to remove.
    if (!d.session.in_progress) {
      const when = centralTime(d.session.start_at);
      return when ? `Starts ${when}` : 'Starting soon';
    }
    return d.insideCount > 0 ? `◆ In session · ${d.insideCount} here` : '◆ In session';
  }
  if (d.state === 'occupied') return `${d.insideCount} here`;
  if (d.state === 'booked' && d.booking) return `Booked · ${centralWhen(d.booking.start_at)}`;
  return 'Available';
}

/** The arrival card row's line: "Live now · sub", "Intern standup · 9:00 AM", "3 here · sub", "Booked · Tue 10:30 AM" or "Available". */
export function rowLine(d: Door): string {
  if (d.state === 'live') return ['Live now', d.sub].filter(Boolean).join(' · ');
  if (d.state === 'in_session' && d.session) {
    // The session's own TITLE, not the room's tagline. The original complaint was that
    // the panel named a meeting that was not in the room being looked at; naming the
    // session on the room it actually runs in is the whole correction.
    const what = d.session.title;
    const when = d.session.in_progress ? 'In session' : `Starts ${centralTime(d.session.start_at)}`.trim();
    return [what, when].filter(Boolean).join(' · ');
  }
  if (d.state === 'occupied') return [`${d.insideCount} here`, d.sub].filter(Boolean).join(' · ');
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
