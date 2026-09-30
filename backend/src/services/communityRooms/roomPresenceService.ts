import { Op, fn, col } from 'sequelize';
import RoomPresence from '../../models/RoomPresence';

// "Who's in this room right now." A client viewing a room / in its video call
// heartbeats every ~30s; a room's live count = distinct enrollments seen within
// the freshness window. Poll-based (no websocket), matching the chat model.
const FRESH_MS = 70_000; // tolerate ~2 missed 30s heartbeats

export async function touchRoomPresence(roomId: string, enrollmentId: string, inVideo = false): Promise<void> {
  const [row] = await RoomPresence.findOrCreate({
    where: { room_id: roomId, enrollment_id: enrollmentId },
    defaults: { room_id: roomId, enrollment_id: enrollmentId, in_video: inVideo, last_seen_at: new Date() },
  });
  await row.update({ last_seen_at: new Date(), in_video: inVideo });
}

// Distinct live-enrollment count per room (only rooms with at least one appear).
export async function hereCounts(roomIds: string[]): Promise<Record<string, number>> {
  if (roomIds.length === 0) return {};
  const since = new Date(Date.now() - FRESH_MS);
  const rows = (await RoomPresence.findAll({
    where: { room_id: { [Op.in]: roomIds }, last_seen_at: { [Op.gte]: since } },
    attributes: ['room_id', [fn('COUNT', fn('DISTINCT', col('enrollment_id'))), 'n']],
    group: ['room_id'],
    raw: true,
  })) as unknown as Array<{ room_id: string; n: string | number }>;
  const out: Record<string, number> = {};
  for (const r of rows) out[r.room_id] = Number(r.n);
  return out;
}
