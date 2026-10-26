import { Op } from 'sequelize';
import CommunityRoom from '../../models/CommunityRoom';
import RoomBooking from '../../models/RoomBooking';
import RoomBookingAttendee from '../../models/RoomBookingAttendee';
import RoomPresence from '../../models/RoomPresence';
import Enrollment from '../../models/Enrollment';
import type { RoomAccessContext } from '../communityRooms/roomEntitlementService';
import { listRoomsForViewer } from '../communityRooms/roomService';
import { visibleSetFor } from './campusPresenceService';
import { getReeseEnrollmentId } from '../reese/reeseIdentitySeed';

/**
 * Campus v7 R2 (Basecamp C29): the Meeting Rooms hallway, read from the existing Community Rooms data. Nothing here is invented:
 *  - rooms: the rooms the viewer may see in full (listRoomsForViewer, the /portal/rooms rule; locked shells never appear), minus
 *    event rooms (they live in the Events Hall, C28) - only rooms someone is in, rooms you own, and rooms you have booked;
 *  - inside: the room's fresh RoomPresence heartbeats (the same 70 s window as /portal/rooms' "here" counts). A person is NAMED only
 *    if the campus presence rule names them for this viewer (visibleSetFor, the people rail's own set); everyone else is counted,
 *    never named;
 *  - friend: a named person in the viewer's cohort (decision log: the spec's fallback "if no relation exists, use cohort");
 *  - bookings: the viewer's upcoming sessions (hosting, or RSVP'd going), scheduled or lobby open.
 * Failure: any read error propagates; the route answers 500 and the card says it could not load the rooms (never an empty hallway).
 */
export const FRESH_MS = 70_000;
export const INSIDE_NAMED_MAX = 4;
export const ROOMS_MAX = 50;
export const BOOKINGS_MAX = 20;

export interface HallwayPerson { enrollment_id: string; display_name: string; avatar_url: string | null; friend: boolean }
export interface HallwayRoom {
  room_id: string; name: string; sub: string; emoji: string | null; privacy: string; mine: boolean;
  inside_count: number; inside: HallwayPerson[];
}
export interface HallwayBooking { booking_id: string; room_id: string; title: string; start_at: string; end_at: string | null; state: string; hosting: boolean }
export interface Hallway { rooms: HallwayRoom[]; bookings: HallwayBooking[]; reese_id: string | null }

type RoomRow = { id: string; name?: string | null; description?: string | null; topic?: string | null; privacy: string; owner_enrollment_id?: string | null; metadata?: Record<string, unknown> | null };

/** Pure: the line under a room's name (its tagline, topic or description), never invented. */
export function roomSub(r: RoomRow): string {
  const tag = typeof r.metadata?.tagline === 'string' ? (r.metadata.tagline as string) : '';
  return (tag || r.topic || r.description || '').trim().slice(0, 120);
}

const isEventRoom = (r: RoomRow) => r.metadata?.kind === 'event' || typeof r.metadata?.event_id === 'string';

async function upcomingBookings(enrollmentId: string, now: Date): Promise<HallwayBooking[]> {
  const going = (await RoomBookingAttendee.findAll({ where: { enrollment_id: enrollmentId, rsvp_state: 'going' }, attributes: ['booking_id'], limit: 200, raw: true })) as unknown as Array<{ booking_id: string }>;
  const rows = await RoomBooking.findAll({
    where: {
      state: { [Op.in]: ['scheduled', 'lobby_open'] },
      start_at: { [Op.gte]: new Date(now.getTime() - 60 * 60_000) },
      [Op.or]: [{ host_enrollment_id: enrollmentId }, ...(going.length ? [{ id: { [Op.in]: going.map((g) => g.booking_id) } }] : [])],
    },
    order: [['start_at', 'ASC']],
    limit: BOOKINGS_MAX,
  });
  return rows.filter((b) => b.start_at).map((b) => ({
    booking_id: b.id, room_id: b.room_id, title: b.title, start_at: new Date(b.start_at as Date).toISOString(),
    end_at: b.end_at ? new Date(b.end_at).toISOString() : null, state: b.state, hosting: b.host_enrollment_id === enrollmentId,
  }));
}

async function insideOf(roomIds: string[], now: Date): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!roomIds.length) return out;
  const rows = (await RoomPresence.findAll({
    where: { room_id: { [Op.in]: roomIds }, last_seen_at: { [Op.gte]: new Date(now.getTime() - FRESH_MS) } },
    attributes: ['room_id', 'enrollment_id'], order: [['last_seen_at', 'DESC']], limit: 500, raw: true,
  })) as unknown as Array<{ room_id: string; enrollment_id: string }>;
  for (const r of rows) {
    const list = out.get(r.room_id) ?? [];
    if (!list.includes(r.enrollment_id)) list.push(r.enrollment_id);
    out.set(r.room_id, list);
  }
  return out;
}

async function cohortsOf(ids: string[]): Promise<Map<string, string | null>> {
  if (!ids.length) return new Map();
  const rows = (await Enrollment.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'cohort_id'], raw: true })) as unknown as Array<{ id: string; cohort_id: string | null }>;
  return new Map(rows.map((r) => [r.id, r.cohort_id]));
}

export async function getHallway(ctx: RoomAccessContext, now: Date = new Date()): Promise<Hallway> {
  const [listed, bookings, reese] = await Promise.all([
    listRoomsForViewer(ctx), upcomingBookings(ctx.enrollmentId, now), getReeseEnrollmentId().catch(() => null),
  ]);
  const full = listed.filter((x) => x.visibility === 'full').map((x) => x.room as unknown as RoomRow).filter((r) => !isEventRoom(r));
  // A booked session's room is shown even when the general list does not carry it (a booking spins up its own room)
  const known = new Set(full.map((r) => r.id));
  const extraIds = bookings.map((b) => b.room_id).filter((id) => !known.has(id));
  const extra = extraIds.length ? ((await CommunityRoom.findAll({ where: { id: { [Op.in]: extraIds } } })) as unknown as RoomRow[]) : [];
  const all = [...full, ...extra];
  const inside = await insideOf(all.map((r) => r.id), now);
  const booked = new Set(bookings.map((b) => b.room_id));
  const keep = all.filter((r) => (inside.get(r.id)?.length ?? 0) > 0 || r.owner_enrollment_id === ctx.enrollmentId || booked.has(r.id)).slice(0, ROOMS_MAX);
  const visible = await visibleSetFor(ctx.enrollmentId, ctx.cohortId ?? null, now);
  const namedIds = Array.from(new Set(keep.flatMap((r) => (inside.get(r.id) ?? []).filter((id) => visible.has(id)))));
  const cohorts = await cohortsOf(namedIds);
  const rooms = keep.map((r): HallwayRoom => {
    const ids = inside.get(r.id) ?? [];
    const named = ids.filter((id) => visible.has(id)).slice(0, INSIDE_NAMED_MAX).map((id) => {
      const p = visible.get(id)!;
      return { enrollment_id: id, display_name: p.display_name, avatar_url: p.avatar_url, friend: !!ctx.cohortId && cohorts.get(id) === ctx.cohortId };
    });
    const emoji = typeof r.metadata?.emoji === 'string' ? (r.metadata.emoji as string) : null;
    return { room_id: r.id, name: (r.name || 'Meeting room').slice(0, 80), sub: roomSub(r), emoji, privacy: r.privacy, mine: r.owner_enrollment_id === ctx.enrollmentId, inside_count: ids.length, inside: named };
  });
  return { rooms, bookings, reese_id: reese };
}
