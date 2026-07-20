import CommunityRoom from '../../models/CommunityRoom';
import RoomMembership, { RoomNotificationPref } from '../../models/RoomMembership';
import { RoomAccessContext, canModerate } from './roomEntitlementService';
import { emitRoomEvent } from './roomOutboxService';
import { ROOM_EVENTS } from './roomEvents';
import { notFoundError, forbiddenError, log } from './roomShared';

// Room membership lifecycle: join, request-access, invite acceptance, approval,
// removal, notification preference, leave. All idempotent on (room_id, enrollment_id).

async function loadRoom(roomId: string): Promise<CommunityRoom> {
  const room = await CommunityRoom.findByPk(roomId);
  if (!room) throw notFoundError('Room not found');
  return room;
}

function cohortMatch(room: CommunityRoom, ctx: RoomAccessContext): boolean {
  return !!room.linked_cohort_id && !!ctx.cohortId && room.linked_cohort_id === ctx.cohortId;
}

// One-click join. Public/cohort rooms self-join; an outstanding invite is
// accepted; invite-only/private with no invite must requestAccess instead.
export async function joinRoom(ctx: RoomAccessContext, roomId: string): Promise<RoomMembership> {
  const room = await loadRoom(roomId);
  const existing = await RoomMembership.findOne({ where: { room_id: roomId, enrollment_id: ctx.enrollmentId } });

  if (existing && existing.access_state === 'active') return existing; // idempotent
  if (existing && existing.access_state === 'blocked') throw forbiddenError('You are blocked from this room');

  const invited = existing && existing.access_state === 'invited';
  const openJoin = room.privacy === 'public' || cohortMatch(room, ctx);

  if (!invited && !openJoin) {
    throw forbiddenError('This room requires an invitation. Request access instead.');
  }

  if (existing) {
    await existing.update({ access_state: 'active', joined_at: existing.joined_at || new Date(), left_at: null });
    log('info', 'room_join', { room_id: roomId, enrollment_id: ctx.enrollmentId, via: invited ? 'invite' : 'open' });
    return existing;
  }
  const membership = await RoomMembership.create({
    room_id: roomId,
    enrollment_id: ctx.enrollmentId,
    role: 'member',
    access_state: 'active',
    joined_at: new Date(),
  });
  log('info', 'room_join', { room_id: roomId, enrollment_id: ctx.enrollmentId, via: 'open' });
  return membership;
}

// Request access to an invite-only/private room (public/cohort rooms just join).
export async function requestAccess(ctx: RoomAccessContext, roomId: string): Promise<RoomMembership> {
  const room = await loadRoom(roomId);
  if (room.privacy === 'public' || cohortMatch(room, ctx)) {
    return joinRoom(ctx, roomId);
  }
  const [membership] = await RoomMembership.findOrCreate({
    where: { room_id: roomId, enrollment_id: ctx.enrollmentId },
    defaults: {
      room_id: roomId,
      enrollment_id: ctx.enrollmentId,
      role: 'member',
      access_state: 'requested',
    },
  });
  // Do not downgrade an already-active/invited member who calls this.
  if (membership.access_state === 'left' || membership.access_state === 'removed') {
    await membership.update({ access_state: 'requested' });
  }
  await emitRoomEvent({
    eventType: ROOM_EVENTS.RoomAccessChanged,
    aggregateType: 'room',
    aggregateId: roomId,
    discriminator: `request:${ctx.enrollmentId}`,
    payload: { enrollment_id: ctx.enrollmentId, action: 'requested' },
  });
  return membership;
}

// Moderator approves a pending request or promotes an invitee to active.
export async function approveAccess(
  ctx: RoomAccessContext,
  roomId: string,
  targetEnrollmentId: string,
): Promise<RoomMembership> {
  const myMembership = await RoomMembership.findOne({ where: { room_id: roomId, enrollment_id: ctx.enrollmentId } });
  if (!canModerate(ctx, myMembership)) throw forbiddenError('Not authorized to manage this room');
  const target = await RoomMembership.findOne({ where: { room_id: roomId, enrollment_id: targetEnrollmentId } });
  if (!target) throw notFoundError('No such member request');
  await target.update({ access_state: 'active', joined_at: target.joined_at || new Date() });
  return target;
}

// Moderator removes a member.
export async function removeMember(
  ctx: RoomAccessContext,
  roomId: string,
  targetEnrollmentId: string,
): Promise<void> {
  const myMembership = await RoomMembership.findOne({ where: { room_id: roomId, enrollment_id: ctx.enrollmentId } });
  if (!canModerate(ctx, myMembership)) throw forbiddenError('Not authorized to manage this room');
  const target = await RoomMembership.findOne({ where: { room_id: roomId, enrollment_id: targetEnrollmentId } });
  if (!target) return; // already gone — idempotent
  await target.update({ access_state: 'removed', left_at: new Date() });
}

export async function setNotificationPref(
  ctx: RoomAccessContext,
  roomId: string,
  pref: RoomNotificationPref,
): Promise<RoomMembership> {
  const membership = await RoomMembership.findOne({ where: { room_id: roomId, enrollment_id: ctx.enrollmentId } });
  if (!membership) throw notFoundError('You are not a member of this room');
  await membership.update({ notification_pref: pref });
  return membership;
}

export async function leaveRoom(ctx: RoomAccessContext, roomId: string): Promise<void> {
  const membership = await RoomMembership.findOne({ where: { room_id: roomId, enrollment_id: ctx.enrollmentId } });
  if (!membership) return; // idempotent
  await membership.update({ access_state: 'left', left_at: new Date() });
}

// Owner/host grants access to a room so invitees can see + join it (this is how
// "give access for people to see my rooms" works). Idempotent per enrollment.
export async function inviteMembers(
  ctx: RoomAccessContext,
  roomId: string,
  enrollmentIds: string[],
): Promise<number> {
  const room = await loadRoom(roomId);
  const mine = await RoomMembership.findOne({ where: { room_id: roomId, enrollment_id: ctx.enrollmentId } });
  const isOwner = room.owner_enrollment_id === ctx.enrollmentId;
  if (!isOwner && !canModerate(ctx, mine)) throw forbiddenError('Only the host can invite people to this room');
  let granted = 0;
  for (const eid of enrollmentIds) {
    if (!eid || eid === ctx.enrollmentId) continue;
    const [m] = await RoomMembership.findOrCreate({
      where: { room_id: roomId, enrollment_id: eid },
      defaults: {
        room_id: roomId, enrollment_id: eid, role: 'member',
        access_state: 'active', joined_at: new Date(), invited_by: ctx.enrollmentId,
      },
    });
    if (m.access_state !== 'active') await m.update({ access_state: 'active', invited_by: ctx.enrollmentId });
    granted += 1;
  }
  log('info', 'room_invite', { room_id: roomId, by: ctx.enrollmentId, granted });
  return granted;
}
