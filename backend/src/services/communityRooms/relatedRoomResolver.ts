import { Op } from 'sequelize';
import CommunityRoom from '../../models/CommunityRoom';

// Resolves each session id to its own Colaberry Commons room (the class's
// waiting room, ensureRoomForSession), for bookings whose related_live_session_id
// points at a *different* session than the one this booking's own room is
// about (e.g. a peer study-group booking that recaps back to an official
// class). Batched — one query for the whole set, not N+1. Returns a Map so a
// missing/unlinked session id (predates Community Rooms, or the flag was off
// at creation) is a normal, silent "no entry" rather than an error.
//
// Deliberately its own file, not part of roomBookingService.ts — that module
// has a long transitive import chain (roomOutboxService -> roomMessageService
// -> communityService -> subscriptionService -> the full models index) that
// makes it impractical to unit test in isolation; this one imports only the
// one model it needs.
export async function resolveRelatedRoomIds(sessionIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(sessionIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const rooms = await CommunityRoom.findAll({
    where: { linked_live_session_id: { [Op.in]: ids } },
    attributes: ['id', 'linked_live_session_id'],
  });
  return new Map(rooms.map((r) => [r.linked_live_session_id as string, r.id]));
}
