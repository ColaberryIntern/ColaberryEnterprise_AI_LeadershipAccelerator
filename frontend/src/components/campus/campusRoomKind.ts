import type { BuildingId } from './campusMap';

/**
 * Campus v7 R1 (Basecamp C28): one rule for where a room lives, used everywhere a room appears (the map, Here now, presence, the
 * Schedule, Coming up, Where to?). Mirrored on the server (services/campus/campusRoomBuilding.ts) so presence agrees with the map.
 *
 *   event   (every broadcast; a room whose metadata says event)  -> amphi   (Events Hall)
 *   class   (a scheduled room linked to a cohort live session)   -> lecture (Classroom)
 *   session (a booked session) / open (an ad-hoc room)           -> commons (Meeting Rooms)
 *
 * Derived from fields the API already returns; nothing is invented.
 */
export type RoomKind = 'event' | 'class' | 'session' | 'open';
export const ROOM_BUILDING: Record<RoomKind, BuildingId> = { event: 'amphi', class: 'lecture', session: 'commons', open: 'commons' };

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
  if (r.broadcast || r.metadata?.kind === 'event' || typeof r.metadata?.event_id === 'string') return 'event';
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
