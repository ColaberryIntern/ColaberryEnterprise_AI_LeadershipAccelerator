import type CommunityRoom from '../../models/CommunityRoom';
import type RoomMembership from '../../models/RoomMembership';
import {
  canTransition, assertTransition, isTerminalBookingState, nextStates,
} from '../../services/communityRooms/roomStateMachine';
import {
  isEligible, roomVisibility, canJoinMeeting, canPost, canModerate, canUploadResource, toRoomShell,
  RoomAccessContext,
} from '../../services/communityRooms/roomEntitlementService';
import { eventIdempotencyKey, ROOM_EVENTS } from '../../services/communityRooms/roomEvents';
import { getMeetingProvider } from '../../services/communityRooms/meetingProvider';

// Pure-logic unit tests — no DB. Rooms/memberships are constructed as plain
// shapes since the entitlement layer only reads fields.
function room(partial: Partial<CommunityRoom>): CommunityRoom {
  return { status: 'active', privacy: 'public', category: 'social', room_type: 'persistent', id: 'r1', created_at: new Date(), ...partial } as unknown as CommunityRoom;
}
function membership(partial: Partial<RoomMembership>): RoomMembership {
  return { access_state: 'active', role: 'member', ...partial } as unknown as RoomMembership;
}
const student: RoomAccessContext = { enrollmentId: 'e1', cohortId: 'c1' };
const admin: RoomAccessContext = { enrollmentId: 'a1', cohortId: null, isAdmin: true };

describe('roomStateMachine', () => {
  it('allows the documented forward path', () => {
    expect(canTransition('draft', 'scheduled')).toBe(true);
    expect(canTransition('scheduled', 'lobby_open')).toBe(true);
    expect(canTransition('lobby_open', 'live')).toBe(true);
    expect(canTransition('live', 'completed')).toBe(true);
    expect(canTransition('completed', 'archived')).toBe(true);
  });
  it('rejects illegal jumps', () => {
    expect(canTransition('draft', 'live')).toBe(false);
    expect(canTransition('completed', 'live')).toBe(false);
  });
  it('treats same-state as an idempotent no-op', () => {
    expect(canTransition('scheduled', 'scheduled')).toBe(true);
  });
  it('locks terminal states', () => {
    expect(isTerminalBookingState('cancelled')).toBe(true);
    expect(isTerminalBookingState('archived')).toBe(true);
    expect(isTerminalBookingState('scheduled')).toBe(false);
    expect(nextStates('cancelled')).toEqual([]);
  });
  it('assertTransition throws a 409 on illegal transitions', () => {
    expect(() => assertTransition('draft', 'live')).toThrow();
    try { assertTransition('draft', 'live'); } catch (e: any) { expect(e.status).toBe(409); }
    expect(() => assertTransition('draft', 'scheduled')).not.toThrow();
  });
});

describe('roomEntitlement — public', () => {
  const r = room({ privacy: 'public' });
  it('is eligible + full + joinable + postable for any student', () => {
    expect(isEligible(r, student, null)).toBe(true);
    expect(roomVisibility(r, student, null)).toBe('full');
    expect(canJoinMeeting(r, student, null)).toBe(true);
    expect(canPost(r, student, null)).toBe(true);
  });
});

describe('roomEntitlement — cohort', () => {
  const r = room({ privacy: 'cohort', linked_cohort_id: 'c1' });
  it('is full for a matching cohort with no explicit membership', () => {
    expect(isEligible(r, student, null)).toBe(true);
    expect(roomVisibility(r, student, null)).toBe('full');
  });
  it('is hidden to a different cohort', () => {
    const other: RoomAccessContext = { enrollmentId: 'e2', cohortId: 'c2' };
    expect(isEligible(r, other, null)).toBe(false);
    expect(roomVisibility(r, other, null)).toBe('hidden');
  });
});

describe('roomEntitlement — private / invite-only', () => {
  const priv = room({ privacy: 'private', linked_cohort_id: 'c9' });
  it('collapses to a locked shell for non-members and never leaks the name', () => {
    expect(isEligible(priv, student, null)).toBe(false);
    expect(roomVisibility(priv, student, null)).toBe('shell');
    const shell = toRoomShell(room({ privacy: 'private', name: 'Secret Interview Prep' }));
    expect((shell as any).name).toBeUndefined();
    expect(shell.locked).toBe(true);
  });
  it('is full for an active member', () => {
    const m = membership({ access_state: 'active', role: 'member' });
    expect(isEligible(priv, student, m)).toBe(true);
    expect(roomVisibility(priv, student, m)).toBe('full');
  });
  it('an invited-but-not-active member is not yet eligible to read content', () => {
    const invited = membership({ access_state: 'invited' });
    expect(isEligible(priv, student, invited)).toBe(false);
  });
});

describe('roomEntitlement — admin + moderation + locking', () => {
  it('admin is eligible everywhere', () => {
    expect(isEligible(room({ privacy: 'private' }), admin, null)).toBe(true);
    expect(canJoinMeeting(room({ privacy: 'private', status: 'locked' }), admin, null)).toBe(true);
  });
  it('a locked room blocks non-admin joins', () => {
    expect(canJoinMeeting(room({ status: 'locked' }), student, membership({}))).toBe(false);
  });
  it('canModerate only for privileged roles', () => {
    expect(canModerate(student, membership({ role: 'owner' }))).toBe(true);
    expect(canModerate(student, membership({ role: 'moderator' }))).toBe(true);
    expect(canModerate(student, membership({ role: 'member' }))).toBe(false);
    expect(canModerate(admin, null)).toBe(true);
  });
  it('canPost is false in a non-active room', () => {
    expect(canPost(room({ status: 'archived' }), student, null)).toBe(false);
  });
});

describe('roomEntitlement — canUploadResource', () => {
  it('public room: staff may upload, a student may not (the ctxOf bug this fixes)', () => {
    const r = room({ privacy: 'public' });
    expect(canUploadResource(r, admin, null)).toBe(true);
    expect(canUploadResource(r, student, null)).toBe(false);
  });
  it('an archived room blocks even staff (canPost gate)', () => {
    expect(canUploadResource(room({ privacy: 'public', status: 'archived' }), admin, null)).toBe(false);
  });
  it('cohort room: a matching-cohort student may upload with no explicit membership', () => {
    const r = room({ privacy: 'cohort', linked_cohort_id: 'c1' });
    expect(canUploadResource(r, student, null)).toBe(true);
  });
  it('private room: an active member may upload, a non-member may not, staff always may', () => {
    const r = room({ privacy: 'private' });
    expect(canUploadResource(r, student, membership({ access_state: 'active' }))).toBe(true);
    expect(canUploadResource(r, student, null)).toBe(false);
    expect(canUploadResource(r, admin, null)).toBe(true);
  });
});

describe('roomEvents idempotency key', () => {
  it('is deterministic and discriminator-sensitive', () => {
    const a = eventIdempotencyKey(ROOM_EVENTS.RoomCreated, 'room-1');
    const b = eventIdempotencyKey(ROOM_EVENTS.RoomCreated, 'room-1');
    const c = eventIdempotencyKey(ROOM_EVENTS.RoomCreated, 'room-1', 'x');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toBe('RoomCreated:room-1');
  });
});

describe('meeting provider factory', () => {
  it('defaults to google_meet and falls back for unknown providers', () => {
    expect(getMeetingProvider().name).toBe('google_meet');
    expect(getMeetingProvider('google_meet').name).toBe('google_meet');
    expect(getMeetingProvider('livekit').name).toBe('google_meet');
    expect(getMeetingProvider(null).supportsEmbedded()).toBe(false);
    expect(getMeetingProvider().supportsBreakouts()).toBe(false);
  });
});
