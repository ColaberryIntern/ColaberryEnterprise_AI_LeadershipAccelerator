import CommunityRoom from '../../models/CommunityRoom';
import RoomMembership from '../../models/RoomMembership';
import { canReadContent, RoomAccessContext } from '../communityRooms/roomEntitlementService';

/**
 * Is this viewer eligible for the room a broadcast belongs to?
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS SO THIN. `broadcastController` passed
 * `roomEligible: false` unconditionally, under a comment saying it would be "wired in P2-07".
 * P2-07 shipped the event backfill and did not wire it, so the literal stayed — and the
 * consequence is not a missing feature but a wrong answer: EVERY private occurrence denied
 * EVERY viewer, including the cohort it was created for. A paywall that denies the people who
 * paid is as broken as one that admits the people who did not.
 *
 * IT DELEGATES RATHER THAN DECIDES. `roomEntitlementService.isEligible` is the canonical gate
 * for the community-rooms domain — pure, exhaustively unit-tested, and already handling
 * public / cohort / invite_only / private plus the admin short-circuit. A second copy of that
 * rule living here is a copy that drifts, and the direction it drifts is "broadcast says yes
 * where rooms say no". So this module only loads the two rows and asks.
 *
 * IT FAILS CLOSED, matching `broadcastEntitlement`: if the room or the membership cannot be
 * read, the answer is "not eligible". A gate that opens when the database is unhappy is not a
 * gate, and the cost of being wrong in the other direction is a viewer who has to retry.
 */

export interface RoomEligibilityDeps {
  findRoom: (roomId: string) => Promise<CommunityRoom | null>;
  findMembership: (roomId: string, enrollmentId: string) => Promise<RoomMembership | null>;
  log?: (line: string) => void;
}

const defaults: RoomEligibilityDeps = {
  findRoom: (roomId) => CommunityRoom.findByPk(roomId),
  // Same one-liner the three room services each keep privately; not exported from any of
  // them, so it is restated here rather than one of them being reached into.
  findMembership: (roomId, enrollmentId) =>
    RoomMembership.findOne({ where: { room_id: roomId, enrollment_id: enrollmentId } }),
};

export async function resolveRoomEligibility(
  roomId: string | null,
  ctx: RoomAccessContext,
  deps: RoomEligibilityDeps = defaults,
): Promise<boolean> {
  // No room means no room-based eligibility. It does NOT mean "allow": a private occurrence
  // with no room is unreachable by design, and that is the safe reading of a missing link.
  if (!roomId) return false;

  try {
    const room = await deps.findRoom(roomId);
    if (!room) return false;
    const membership = await deps.findMembership(roomId, ctx.enrollmentId);
    return canReadContent(room, ctx, membership);
  } catch (err) {
    (deps.log ?? ((line: string) => console.error(line)))(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'broadcast',
      event: 'broadcast_room_eligibility_failed', outcome: 'failure',
      error_class: (err as Error)?.name ?? 'UnexpectedError',
      context: { roomId, error_name: (err as Error)?.name ?? 'unknown' },
    }));
    return false;
  }
}
