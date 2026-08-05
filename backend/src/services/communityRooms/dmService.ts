import { Op } from 'sequelize';
import CommunityRoom from '../../models/CommunityRoom';
import RoomMembership from '../../models/RoomMembership';
import Enrollment from '../../models/Enrollment';
import RoomMessage from '../../models/RoomMessage';
import { RoomAccessContext } from './roomEntitlementService';
import { postMessage, listMessages } from './roomMessageService';

// A peer's typing touch is considered stale after this window — client
// throttles its touch to ~every 2.5s while actively typing, so 6s tolerates
// one missed touch without the indicator flickering (same tolerance-window
// pattern as RoomPresence's heartbeat).
const TYPING_FRESH_MS = 6_000;

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

/** Send a message in a DM room (room-service auth enforces membership). clientId
 * makes a retried send idempotent — see postMessage's client_id dedup. */
export async function sendDmMessage(ctx: RoomAccessContext, roomId: string, content: string, clientId?: string): Promise<RoomMessage> {
  await assertDmRoom(roomId);
  return postMessage(ctx, roomId, { content, client_id: clientId });
}

async function findOtherMembership(roomId: string, me: string): Promise<RoomMembership | null> {
  const others = await RoomMembership.findAll({ where: { room_id: roomId, enrollment_id: { [Op.ne]: me } } });
  return others[0] ?? null;
}

export interface DmListResult {
  messages: Array<ReturnType<RoomMessage['toJSON']> & { delivery_state?: 'sent' | 'delivered' }>;
  active_count: number;
  peer_typing: boolean;
}

/**
 * List a DM's messages (room-service auth enforces membership), enriched with
 * delivery ticks and the peer's typing state — both derived from poll cursors
 * on RoomMembership, no websockets.
 *
 * Delivery model: fetching this thread IS the delivery signal (the client just
 * received whatever's in it), so touching my own `last_delivered_at` here lets
 * the OTHER participant's next poll mark messages I authored as "delivered"
 * once it sees my cursor has passed their created_at. "Sent" is the default
 * until then. No read receipts in v1 (matches the approved mockup).
 */
export async function listDmMessages(ctx: RoomAccessContext, roomId: string, since?: string): Promise<DmListResult> {
  await assertDmRoom(roomId);
  const me = ctx.enrollmentId;

  try {
    await RoomMembership.update({ last_delivered_at: new Date() }, { where: { room_id: roomId, enrollment_id: me } });
  } catch {
    // Non-fatal: worst case, delivery ticks lag a beat. Never blocks the read.
  }

  const [{ messages, active_count }, peer] = await Promise.all([
    listMessages(ctx, roomId, { since }),
    findOtherMembership(roomId, me),
  ]);

  const peerDeliveredThrough = peer?.last_delivered_at ?? null;
  const peerTyping = !!peer?.typing_at && Date.now() - new Date(peer.typing_at).getTime() < TYPING_FRESH_MS;

  const enriched = messages.map((m) => {
    const dto = m.toJSON() as ReturnType<RoomMessage['toJSON']> & { delivery_state?: 'sent' | 'delivered' };
    if (m.enrollment_id === me) {
      dto.delivery_state = peerDeliveredThrough && new Date(peerDeliveredThrough) >= new Date(m.created_at) ? 'delivered' : 'sent';
    }
    return dto;
  });

  return { messages: enriched, active_count, peer_typing: peerTyping };
}

/** Touch my typing cursor in a DM. Fire-and-forget from the client, throttled
 * client-side (~every 2.5s while actively typing). Idempotent — repeat calls
 * just advance the timestamp, no duplicate side effect. */
export async function touchDmTyping(me: string, roomId: string): Promise<void> {
  await assertDmRoom(roomId);
  await RoomMembership.update({ typing_at: new Date() }, { where: { room_id: roomId, enrollment_id: me } });
}

export interface DmConversation {
  roomId: string;
  peerId: string;
  peerName: string;
  peerAvatar: string | null;
  lastMessage: string;
  lastAt: Date;
  unread: boolean;
}

/**
 * My DM conversations (rooms with a message), newest-activity first, each with
 * an `unread` flag — the last message is from the other person and newer than my
 * read cursor. Powers the Messages inbox + its unread badge.
 */
export async function listConversations(me: string): Promise<DmConversation[]> {
  const myMemberships = await RoomMembership.findAll({ where: { enrollment_id: me, access_state: 'active' } });
  if (myMemberships.length === 0) return [];
  const roomIds = myMemberships.map((m) => m.room_id);
  const dmRooms = await CommunityRoom.findAll({ where: { id: { [Op.in]: roomIds }, room_type: 'dm' } });
  const lastReadByRoom = new Map(myMemberships.map((m) => [m.room_id, m.last_read_at ?? null]));

  const convos: DmConversation[] = [];
  for (const room of dmRooms) {
    const others = await RoomMembership.findAll({ where: { room_id: room.id, enrollment_id: { [Op.ne]: me } } });
    const otherId = others[0]?.enrollment_id;
    if (!otherId) continue;
    const [other, last] = await Promise.all([
      Enrollment.findByPk(otherId, { attributes: ['id', 'full_name', 'avatar_data_url'] }),
      RoomMessage.findOne({ where: { room_id: room.id, deleted_at: null }, order: [['created_at', 'DESC']] }),
    ]);
    if (!last) continue; // no messages yet — nothing to list
    const lastRead = lastReadByRoom.get(room.id) ?? null;
    const unread = last.enrollment_id !== me && (!lastRead || last.created_at > lastRead);
    convos.push({
      roomId: room.id,
      peerId: otherId,
      peerName: (other as any)?.full_name || 'Member',
      peerAvatar: (other as any)?.avatar_data_url ?? null,
      lastMessage: last.content,
      lastAt: last.created_at,
      unread,
    });
  }
  convos.sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
  return convos;
}

/** Mark a DM read up to now (clears its unread state for me). */
export async function markDmRead(me: string, roomId: string): Promise<void> {
  await assertDmRoom(roomId);
  await RoomMembership.update({ last_read_at: new Date() }, { where: { room_id: roomId, enrollment_id: me } });
}
