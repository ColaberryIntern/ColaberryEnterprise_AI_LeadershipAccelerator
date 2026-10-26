import type { BuildingId } from './campusMap';

/**
 * Campus v7 R1 (Basecamp C28): one rule for where a room lives, used everywhere a room appears (the map, Here now, presence, the
 * Schedule, Coming up, Where to?). Mirrored on the server (services/campus/campusRoomBuilding.ts) so presence agrees with the map.
 *
 *   live    (a broadcast airs in it: Colaberry Live)             -> amphi   (Events Hall)
 *   event   (a room whose metadata says event)                   -> commons (Meeting Rooms)
 *   class   (a scheduled room linked to a cohort live session)   -> lecture (Classroom)
 *   session (a booked session) / open (an ad-hoc room)           -> commons (Meeting Rooms)
 *
 * Round 7 (Basecamp C62, Ali 2026-10-26): "Events go on in the meeting rooms and Colaberry Live events are in the auditorium" and
 * "It can stay Events Hall". Live and events were one kind until then; they are split here so every caller follows.
 *
 * Derived from fields the API already returns; nothing is invented.
 */
export type RoomKind = 'live' | 'event' | 'class' | 'session' | 'open';
export const ROOM_BUILDING: Record<RoomKind, BuildingId> = { live: 'amphi', event: 'commons', class: 'lecture', session: 'commons', open: 'commons' };
/** C62: where events happen (the Meeting Rooms): the event list, the next event, its badge, banner and wall board. */
export const EVENTS_BUILDING: BuildingId = ROOM_BUILDING.event;

export interface RoomLike {
  room_type?: string | null;
  linked_live_session_id?: string | null;
  metadata?: { kind?: unknown; event_id?: unknown } | null;
  /** The room has a booked session (room_bookings). */
  has_booking?: boolean;
  /** A broadcast airs in it. */
  broadcast?: boolean;
}

export function roomKind(r: RoomLike): RoomKind {
  if (r.broadcast) return 'live';
  if (r.metadata?.kind === 'event' || typeof r.metadata?.event_id === 'string') return 'event';
  if (r.room_type === 'scheduled' && r.linked_live_session_id) return 'class';
  if (r.has_booking) return 'session';
  return 'open';
}

export const roomBuilding = (r: RoomLike): BuildingId => ROOM_BUILDING[roomKind(r)];

/** The room id of a room page (/portal/rooms/:id), else null. */
export function roomIdOfPath(path: string): string | null {
  const m = /^\/portal\/rooms\/([0-9a-f-]{36})(?:\/|$)/i.exec(path);
  return m ? m[1] : null;
}
