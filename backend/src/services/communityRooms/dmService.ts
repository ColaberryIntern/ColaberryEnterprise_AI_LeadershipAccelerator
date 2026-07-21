import CommunityRoom from '../../models/CommunityRoom';
import RoomMembership from '../../models/RoomMembership';
import Enrollment from '../../models/Enrollment';
import RoomMessage from '../../models/RoomMessage';
import { RoomAccessContext } from './roomEntitlementService';
import { postMessage, listMessages } from './roomMessageService';

// 1:1 direct messages, modelled as a 2-person private CommunityRoom
// (room_type 'dm') so they reuse the persisted RoomMessage layer — messages
// survive for an offline recipient with no new tables. A DM is keyed on a
// deterministic sorted-pair slug (`dm-<a>-<b>`) so open() is idempotent and
// race-safe via the community_rooms slug unique index. These live OUTSIDE the
// flag-gated Rooms routes (the models/services aren't flag-gated), so DMs work
// even while Colaberry Commons stays dark.

export class DmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DmError';
  }
}

async function assertSameCohort(otherId: string, myCohortId: string | null | undefined): Promise<void> {
  if (!myCohortId) throw new DmError('You are not in a cohort yet');
  const other = await Enrollment.findByPk(otherId);
  if (!other || other.cohort_id !== myCohortId) {
    throw new DmError('You can only message people in your cohort');
  }
}

/**
 * Find-or-create the canonical DM room for {me, otherId} and ensure both are
 * active members. Returns the room id the chat dock talks to. Cohort-scoped.
 */
export async function openDm(me: string, otherId: string, myCohortId: string | null | undefined): Promise<{ roomId: string }> {
  if (!otherId || otherId === me) throw new DmError('Invalid recipient');
  await assertSameCohort(otherId, myCohortId);

  const [a, b] = [me, otherId].sort();
  const slug = `dm-${a}-${b}`; // "dm-" + two UUIDs = 75 chars, fits VARCHAR(140)

  const [room] = await CommunityRoom.findOrCreate({
    where: { slug },
    defaults: {
      slug,
      name: 'Direct message',
      room_type: 'dm',
      privacy: 'private',
      category: 'private_rooms',
      status: 'active',
      is_system: true,
      created_by: 'system',
      linked_cohort_id: myCohortId,
    } as any,
  });

  // Both participants active → both can read + post; nobody else can (private
  // room auth in the room services). Idempotent via the (room_id, enrollment_id)
  // unique index.
  for (const eid of [a, b]) {
    await RoomMembership.findOrCreate({
      where: { room_id: room.id, enrollment_id: eid },
      defaults: {
        room_id: room.id,
        enrollment_id: eid,
        role: 'member',
        access_state: 'active',
        joined_at: new Date(),
      } as any,
    });
  }

  return { roomId: room.id };
}

// Guard: the DM endpoints only ever touch a room_type='dm' room, so they can't
// be used to post into cohort/other rooms the caller happens to belong to.
async function assertDmRoom(roomId: string): Promise<void> {
  const room = await CommunityRoom.findByPk(roomId);
  if (!room || room.room_type !== 'dm') throw new DmError('Not a direct message');
}

/** Send a message in a DM room (room-service auth enforces membership). */
export async function sendDmMessage(ctx: RoomAccessContext, roomId: string, content: string): Promise<RoomMessage> {
  await assertDmRoom(roomId);
  return postMessage(ctx, roomId, { content });
}

/** List a DM's messages (room-service auth enforces membership). */
export async function listDmMessages(ctx: RoomAccessContext, roomId: string, since?: string) {
  await assertDmRoom(roomId);
  return listMessages(ctx, roomId, { since });
}
