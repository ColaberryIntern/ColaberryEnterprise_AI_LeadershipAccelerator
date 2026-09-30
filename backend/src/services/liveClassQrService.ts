// Posts the check-in QR into a just-gone-live session's Colaberry Commons
// waiting room, once, the moment the session-lifecycle cron flips it to
// 'live'. Part of retiring the old /portal/sessions/:id waiting room in favor
// of the room ensureRoomForSession already auto-provisions per session.
import { CommunityRoom, LiveSession } from '../models';
import { buildSessionKit } from './sessionKitService';
import { postSystemMessage } from './communityRooms/roomMessageService';

// ensureRoomForSession's link is a left join elsewhere (getNextLiveSession,
// getCheckinInfo) — a room-less session (e.g. created while Community Rooms
// was disabled) is a legitimate no-op here too, not an error. Idempotent via
// postSystemMessage's marker, so a cron re-run can never double-post.
export async function postLiveClassQrToRoom(session: LiveSession): Promise<void> {
  const room = await CommunityRoom.findOne({ where: { linked_live_session_id: session.id } });
  if (!room) return;

  const kit = await buildSessionKit(session.id);
  if (!kit) return;

  await postSystemMessage(
    room.id,
    `🔴 Class is live! Scan or open this link to check in: ${kit.checkin_url}`,
    { marker: `session-live-qr:${session.id}` },
  );
}
