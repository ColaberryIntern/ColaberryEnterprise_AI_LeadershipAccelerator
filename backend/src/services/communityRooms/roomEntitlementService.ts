import CommunityRoom from '../../models/CommunityRoom';
import RoomMembership from '../../models/RoomMembership';

// Server-side entitlement for community rooms (spec §10 visibility matrix + the
// "all Join endpoints re-check entitlement" rule). PURE — no DB reads — so it is
// exhaustively unit-testable; callers load the room + the viewer's membership and
// pass them in. The controllers/services MUST gate every read/join/post on these
// helpers; never trust the client.

export interface RoomAccessContext {
  enrollmentId: string;
  cohortId?: string | null;
  isAdmin?: boolean;
}

// full  = see everything the viewer is entitled to (content, host, link on join)
// shell = see only a safe locked shell (generic title/category, time, occupancy)
// hidden = the room is not shown at all
export type RoomVisibility = 'full' | 'shell' | 'hidden';

function activeMember(membership: RoomMembership | null | undefined): boolean {
  return !!membership && membership.access_state === 'active';
}

function cohortMatch(room: CommunityRoom, ctx: RoomAccessContext): boolean {
  return !!room.linked_cohort_id && !!ctx.cohortId && room.linked_cohort_id === ctx.cohortId;
}

// Eligible = may read content + join the meeting. This is the core gate.
export function isEligible(
  room: CommunityRoom,
  ctx: RoomAccessContext,
  membership: RoomMembership | null | undefined,
): boolean {
  if (ctx.isAdmin) return true;
  switch (room.privacy) {
    case 'public':
      return true;
    case 'cohort':
      return cohortMatch(room, ctx) || activeMember(membership);
    case 'invite_only':
    case 'private':
      return activeMember(membership);
    default:
      return false;
  }
}

export function roomVisibility(
  room: CommunityRoom,
  ctx: RoomAccessContext,
  membership: RoomMembership | null | undefined,
): RoomVisibility {
  if (isEligible(room, ctx, membership)) return 'full';
  switch (room.privacy) {
    case 'public':
      return 'full';
    case 'cohort':
      // Other cohorts do not see a cohort room at all.
      return 'hidden';
    case 'invite_only':
    case 'private':
      // Everyone may see a safe locked shell + occupancy, never the content.
      return 'shell';
    default:
      return 'hidden';
  }
}

export function canReadContent(
  room: CommunityRoom,
  ctx: RoomAccessContext,
  membership: RoomMembership | null | undefined,
): boolean {
  return isEligible(room, ctx, membership);
}

export function canJoinMeeting(
  room: CommunityRoom,
  ctx: RoomAccessContext,
  membership: RoomMembership | null | undefined,
): boolean {
  if (room.status === 'locked' || room.status === 'removed' || room.status === 'archived') {
    return !!ctx.isAdmin;
  }
  return isEligible(room, ctx, membership);
}

export function canPost(
  room: CommunityRoom,
  ctx: RoomAccessContext,
  membership: RoomMembership | null | undefined,
): boolean {
  if (room.status !== 'active') return false;
  return isEligible(room, ctx, membership);
}

export function canModerate(
  ctx: RoomAccessContext,
  membership: RoomMembership | null | undefined,
): boolean {
  if (ctx.isAdmin) return true;
  const role = membership?.role;
  return role === 'owner' || role === 'host' || role === 'cohost' || role === 'moderator';
}

// Reduce a room to the safe locked shell exposed to non-eligible viewers of a
// private/invite-only room. NEVER leak name detail, purpose, host, or link.
export interface RoomShell {
  id: string;
  category: CommunityRoom['category'];
  privacy: CommunityRoom['privacy'];
  status: CommunityRoom['status'];
  room_type: CommunityRoom['room_type'];
  locked: true;
  created_at: Date;
}

export function toRoomShell(room: CommunityRoom): RoomShell {
  return {
    id: room.id,
    category: room.category,
    privacy: room.privacy,
    status: room.status,
    room_type: room.room_type,
    locked: true,
    created_at: room.created_at,
  };
}
