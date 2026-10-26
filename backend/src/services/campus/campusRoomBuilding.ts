import CommunityRoom from '../../models/CommunityRoom';
import RoomBooking from '../../models/RoomBooking';
import BroadcastOccurrence from '../../models/BroadcastOccurrence';
import type { CampusArea } from './campusAreas';

/**
 * Campus v7 R1 (Basecamp C28): one rule for where a room lives, mirrored from the frontend's campusRoomKind.ts so presence agrees
 * with the map. A person on /portal/rooms/:id counts in that room's building, not always the commons.
 *
 *   event   (a broadcast airs in it, or its metadata says event)  -> amphi   (Events Hall)
 *   class   (a scheduled room linked to a cohort live session)    -> lecture (Classroom)
 *   session (a booked session) / open (an ad-hoc room)            -> commons (Meeting Rooms)
 *
 * Derived from existing columns only (no migration). Failure: the caller keeps the area the client sent.
 */
export type RoomKind = 'event' | 'class' | 'session' | 'open';
export const ROOM_BUILDING: Record<RoomKind, CampusArea> = { event: 'amphi', class: 'lecture', session: 'commons', open: 'commons' };

export interface RoomFacts {
  room_type: string | null;
  linked_live_session_id: string | null;
  metadata: Record<string, unknown> | null;
  hasBooking: boolean;
  hasBroadcast: boolean;
}

/** Pure: the room's kind from its facts. */
export function roomKindOf(r: RoomFacts): RoomKind {
  const meta = r.metadata ?? {};
  if (r.hasBroadcast || meta.kind === 'event' || typeof meta.event_id === 'string') return 'event';
  if (r.room_type === 'scheduled' && r.linked_live_session_id) return 'class';
  if (r.hasBooking) return 'session';
  return 'open';
}

/** The building a room lives in, or null when the room does not exist. */
export async function roomBuildingFor(roomId: string): Promise<CampusArea | null> {
  const room = await CommunityRoom.findByPk(roomId, { attributes: ['id', 'room_type', 'linked_live_session_id', 'metadata'] });
  if (!room) return null;
  const [bookings, broadcasts] = await Promise.all([
    RoomBooking.count({ where: { room_id: roomId } }),
    BroadcastOccurrence.count({ where: { room_id: roomId } }),
  ]);
  const r = room as unknown as { room_type: string | null; linked_live_session_id: string | null; metadata: Record<string, unknown> | null };
  return ROOM_BUILDING[roomKindOf({ room_type: r.room_type, linked_live_session_id: r.linked_live_session_id, metadata: r.metadata, hasBooking: bookings > 0, hasBroadcast: broadcasts > 0 })];
}
