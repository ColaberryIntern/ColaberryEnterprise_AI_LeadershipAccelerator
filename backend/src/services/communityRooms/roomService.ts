import { Op } from 'sequelize';
import CommunityRoom, { RoomCategory, RoomPrivacy } from '../../models/CommunityRoom';
import RoomMembership from '../../models/RoomMembership';
import RoomBooking from '../../models/RoomBooking';
import RoomMessage from '../../models/RoomMessage';
import LiveSession from '../../models/LiveSession';
import { emitRoomEvent } from './roomOutboxService';
import { ROOM_EVENTS } from './roomEvents';
import {
  RoomAccessContext,
  roomVisibility,
  toRoomShell,
  RoomShell,
  canModerate,
  canJoinMeeting,
} from './roomEntitlementService';
import { getMeetingProvider } from './meetingProvider';
import { log, slugify, shortToken, notFoundError, forbiddenError, validationError, conflictError } from './roomShared';

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
  is_video?: boolean;
  emoji?: string;
}

export async function createRoom(ctx: RoomAccessContext, input: CreateRoomInput): Promise<CommunityRoom> {
  // Members create PRIVATE or COHORT rooms only — public rooms are system-seeded
  // (the always-open defaults) or admin-created. Default + coerce to private.
  let privacy: RoomPrivacy = input.privacy || 'private';
  if (privacy === 'public' && !ctx.isAdmin) privacy = 'private';
  const room = await CommunityRoom.create({
    slug: slugify(input.name, shortToken()),
    name: input.name,
    category: input.category || 'social',
    room_type: 'persistent',
    privacy,
    status: 'active',
    description: input.description ?? null,
    topic: input.topic ?? null,
    capacity: input.capacity ?? null,
    owner_enrollment_id: ctx.enrollmentId,
    linked_cohort_id: ctx.cohortId ?? null,
    linked_project_id: input.linked_project_id ?? null,
    linked_module_id: input.linked_module_id ?? null,
    // Video rooms are always-open: anyone eligible can jump into the same Meet
    // anytime. The Meet link is minted lazily on first join (see joinVideoRoom).
    is_video: input.is_video ?? false,
    always_open: input.is_video ?? false,
    is_system: false,
    created_by: ctx.enrollmentId,
    metadata: input.emoji ? { emoji: input.emoji } : {},
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

// Join an always-open video room. Entitlement is re-checked server-side EVERY
// time; the Google Meet link is minted lazily on first join and then shared by
// everyone who jumps in (that's what makes it a persistent "room").
export async function joinVideoRoom(
  ctx: RoomAccessContext,
  roomId: string,
): Promise<{ join_url: string | null }> {
  const room = await CommunityRoom.findByPk(roomId);
  if (!room) throw notFoundError('Room not found');
  if (!room.is_video) throw validationError('This room is not a video room');
  const membership = await getMembership(roomId, ctx.enrollmentId);
  if (!canJoinMeeting(room, ctx, membership)) throw forbiddenError('You are not authorized to join this room');

  if (room.meeting_link) return { join_url: room.meeting_link };

  // First join provisions a persistent Meet link (1-year window; the link stays
  // joinable). Best-effort — surface no link rather than error if Google is down.
  const provider = getMeetingProvider('google_meet');
  const now = new Date();
  const end = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const result = await provider.createMeeting({
    title: `Colaberry Rooms — ${room.name}`,
    description: room.description || 'Always-open community video room',
    startAt: now,
    endAt: end,
    timezone: 'America/Chicago',
    requestId: `room-${room.id}`,
  });
  if (result.joinUrl) await room.update({ meeting_link: result.joinUrl });
  log('info', 'video_room_join', { room_id: roomId, has_link: !!result.joinUrl });
  return { join_url: result.joinUrl };
}

// Delete a room (owner or admin). Blocked when it has any upcoming sessions, and
// never for the seeded default rooms. Hard-deletes the room + its data.
export async function deleteRoom(ctx: RoomAccessContext, roomId: string): Promise<void> {
  const room = await CommunityRoom.findByPk(roomId);
  if (!room) throw notFoundError('Room not found');
  if (room.is_system) throw forbiddenError('Default rooms cannot be deleted');
  if (room.owner_enrollment_id !== ctx.enrollmentId && !ctx.isAdmin) {
    throw forbiddenError('Only the room owner can delete it');
  }
  const upcoming = await RoomBooking.count({
    where: {
      room_id: roomId,
      state: { [Op.in]: ['pending_approval', 'scheduled', 'lobby_open', 'live'] },
      start_at: { [Op.gt]: new Date() },
    },
  });
  if (upcoming > 0) throw conflictError('This room has upcoming sessions — cancel them first.');
  await Promise.all([
    RoomMembership.destroy({ where: { room_id: roomId } }),
    RoomMessage.destroy({ where: { room_id: roomId } }),
    RoomBooking.destroy({ where: { room_id: roomId } }),
  ]);
  await room.destroy();
  log('info', 'room_deleted', { room_id: roomId, by: ctx.enrollmentId });
}
