import { Op } from 'sequelize';
import CommunityRoom, { RoomCategory, RoomPrivacy } from '../../models/CommunityRoom';
import RoomMembership from '../../models/RoomMembership';
import LiveSession from '../../models/LiveSession';
import { emitRoomEvent } from './roomOutboxService';
import { ROOM_EVENTS } from './roomEvents';
import {
  RoomAccessContext,
  roomVisibility,
  toRoomShell,
  RoomShell,
  canModerate,
} from './roomEntitlementService';
import { log, slugify, shortToken, notFoundError, forbiddenError } from './roomShared';

// Rooms CRUD + discovery + the official-session linkage. Entitlement decisions
// are delegated to roomEntitlementService; this module never returns a room a
// viewer may not see (private/invite-only collapse to a locked shell).

export async function getMembership(roomId: string, enrollmentId: string): Promise<RoomMembership | null> {
  return RoomMembership.findOne({ where: { room_id: roomId, enrollment_id: enrollmentId } });
}

// Idempotent linked cohort room for an official LiveSession (acceptance #1).
// Keyed on linked_live_session_id (partial unique index) so re-running session
// creation never spawns a second room. Best-effort caller: never blocks session
// creation on this.
export async function ensureRoomForSession(session: LiveSession): Promise<CommunityRoom> {
  const [room, created] = await CommunityRoom.findOrCreate({
    where: { linked_live_session_id: session.id },
    defaults: {
      slug: `session-${session.id}`,
      name: session.title || `Session ${session.session_number}`,
      category: 'your_cohort',
      room_type: 'scheduled',
      privacy: 'cohort',
      status: 'active',
      topic: session.description || null,
      linked_cohort_id: session.cohort_id,
      linked_live_session_id: session.id,
      is_system: true,
      created_by: 'system',
    },
  });
  if (created) {
    await emitRoomEvent({ eventType: ROOM_EVENTS.RoomCreated, aggregateType: 'room', aggregateId: room.id });
    log('info', 'room_created_for_session', { room_id: room.id, session_id: session.id });
  }
  return room;
}

export interface CreateRoomInput {
  name: string;
  category?: RoomCategory;
  privacy?: RoomPrivacy;
  description?: string;
  topic?: string;
  capacity?: number;
  linked_project_id?: string;
  linked_module_id?: string;
}

export async function createRoom(ctx: RoomAccessContext, input: CreateRoomInput): Promise<CommunityRoom> {
  const room = await CommunityRoom.create({
    slug: slugify(input.name, shortToken()),
    name: input.name,
    category: input.category || 'social',
    room_type: 'persistent',
    privacy: input.privacy || 'public',
    status: 'active',
    description: input.description ?? null,
    topic: input.topic ?? null,
    capacity: input.capacity ?? null,
    owner_enrollment_id: ctx.enrollmentId,
    linked_cohort_id: ctx.cohortId ?? null,
    linked_project_id: input.linked_project_id ?? null,
    linked_module_id: input.linked_module_id ?? null,
    is_system: false,
    created_by: ctx.enrollmentId,
  });
  // Creator is the owner member.
  await RoomMembership.findOrCreate({
    where: { room_id: room.id, enrollment_id: ctx.enrollmentId },
    defaults: {
      room_id: room.id,
      enrollment_id: ctx.enrollmentId,
      role: 'owner',
      access_state: 'active',
      joined_at: new Date(),
    },
  });
  await emitRoomEvent({ eventType: ROOM_EVENTS.RoomCreated, aggregateType: 'room', aggregateId: room.id });
  log('info', 'room_created', { room_id: room.id, by: ctx.enrollmentId, privacy: room.privacy });
  return room;
}

export interface RoomView {
  visibility: 'full' | 'shell';
  room: CommunityRoom | RoomShell;
  membership: RoomMembership | null;
}

// Returns the viewer-appropriate projection of a room, or throws 404 when the
// room is hidden to this viewer (so a hidden cohort room is indistinguishable
// from a non-existent one).
export async function getRoomForViewer(ctx: RoomAccessContext, roomId: string): Promise<RoomView> {
  const room = await CommunityRoom.findByPk(roomId);
  if (!room) throw notFoundError('Room not found');
  const membership = await getMembership(roomId, ctx.enrollmentId);
  const vis = roomVisibility(room, ctx, membership);
  if (vis === 'hidden') throw notFoundError('Room not found');
  if (vis === 'shell') return { visibility: 'shell', room: toRoomShell(room), membership };
  return { visibility: 'full', room, membership };
}

export interface ListRoomsFilter {
  category?: RoomCategory;
}

// Discovery/browse. Every candidate room is passed through the entitlement
// projection; hidden rooms are dropped, private/invite-only rooms collapse to a
// shell. Never leaks a private room's details in a list payload.
export async function listRoomsForViewer(
  ctx: RoomAccessContext,
  filter: ListRoomsFilter = {},
): Promise<Array<{ visibility: 'full' | 'shell'; room: CommunityRoom | RoomShell }>> {
  const where: Record<string, unknown> = { status: { [Op.in]: ['active', 'locked'] } };
  if (filter.category) where.category = filter.category;
  const rooms = await CommunityRoom.findAll({ where, order: [['created_at', 'DESC']], limit: 200 });

  const myMemberships = await RoomMembership.findAll({
    where: { enrollment_id: ctx.enrollmentId, room_id: { [Op.in]: rooms.map((r) => r.id) } },
  });
  const membershipByRoom = new Map(myMemberships.map((m) => [m.room_id, m]));

  const out: Array<{ visibility: 'full' | 'shell'; room: CommunityRoom | RoomShell }> = [];
  for (const room of rooms) {
    const vis = roomVisibility(room, ctx, membershipByRoom.get(room.id) || null);
    if (vis === 'hidden') continue;
    out.push(vis === 'shell' ? { visibility: 'shell', room: toRoomShell(room) } : { visibility: 'full', room });
  }
  return out;
}

export interface UpdateRoomInput {
  name?: string;
  description?: string | null;
  topic?: string | null;
  category?: RoomCategory;
  privacy?: RoomPrivacy;
  capacity?: number | null;
  status?: 'active' | 'archived' | 'locked';
}

export async function updateRoom(
  ctx: RoomAccessContext,
  roomId: string,
  patch: UpdateRoomInput,
): Promise<CommunityRoom> {
  const room = await CommunityRoom.findByPk(roomId);
  if (!room) throw notFoundError('Room not found');
  const membership = await getMembership(roomId, ctx.enrollmentId);
  if (!canModerate(ctx, membership)) throw forbiddenError('Not authorized to edit this room');
  const prevPrivacy = room.privacy;
  await room.update({
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.topic !== undefined ? { topic: patch.topic } : {}),
    ...(patch.category !== undefined ? { category: patch.category } : {}),
    ...(patch.privacy !== undefined ? { privacy: patch.privacy } : {}),
    ...(patch.capacity !== undefined ? { capacity: patch.capacity } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
  });
  if (patch.privacy !== undefined && patch.privacy !== prevPrivacy) {
    await emitRoomEvent({ eventType: ROOM_EVENTS.RoomAccessChanged, aggregateType: 'room', aggregateId: room.id });
  }
  return room;
}
