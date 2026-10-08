// The models barrel is heavy and reaches for a database at import time. Stubbed here for
// the same reason the entitlement suite stubs it: without this, importing the module under
// test pulls in the whole model layer and the suite goes from seconds to minutes.
jest.mock('../../../models/CommunityRoom', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../../models/RoomMembership', () => ({ __esModule: true, default: { findOne: jest.fn() } }));

import { resolveRoomEligibility, RoomEligibilityDeps } from '../broadcastRoomEligibility';

/**
 * Does the viewer qualify for the room a broadcast belongs to?
 *
 * This module exists because `broadcastController` passed `roomEligible: false` as a literal,
 * so every private occurrence denied every viewer including its own cohort. The tests below
 * therefore care about two things: that the answer is now actually computed, and that it is
 * computed by DELEGATING to the canonical room gate rather than by a second copy of the rule.
 *
 * The delegation is checked by behaviour, not by spying on an import: each case sets up a room
 * and a membership and asserts the answer `roomEntitlementService.isEligible` would give. If
 * this module ever grows its own opinion, these cases diverge from it.
 */

type Room = Parameters<RoomEligibilityDeps['findRoom']> extends unknown ? Record<string, unknown> : never;

function room(over: Record<string, unknown> = {}): Room {
  return { id: 'room-1', privacy: 'private', status: 'active', ...over } as Room;
}

function deps(over: Partial<RoomEligibilityDeps> = {}): RoomEligibilityDeps {
  return {
    findRoom: jest.fn(async () => room() as never),
    findMembership: jest.fn(async () => null),
    log: jest.fn(),
    ...over,
  };
}

const VIEWER = { enrollmentId: 'enr-1', cohortId: 'coh-1', isAdmin: false };

describe('the answer is computed, not assumed', () => {
  it('says no when the occurrence has no room at all', async () => {
    const d = deps();
    expect(await resolveRoomEligibility(null, VIEWER, d)).toBe(false);
    // And it does not go looking: a missing link is decided without a query.
    expect(d.findRoom).not.toHaveBeenCalled();
  });

  it('says no when the room has been deleted from under the occurrence', async () => {
    // room_id carries no foreign key by design — it is a cross-epic link — so a dangling id
    // is a state the schema permits and this has to answer rather than throw.
    expect(await resolveRoomEligibility('room-1', VIEWER, deps({ findRoom: jest.fn(async () => null) })))
      .toBe(false);
  });

  it('says YES for an active member of a private room — the case that was broken', async () => {
    const d = deps({ findMembership: jest.fn(async () => ({ access_state: 'active' } as never)) });
    expect(await resolveRoomEligibility('room-1', VIEWER, d)).toBe(true);
    expect(d.findMembership).toHaveBeenCalledWith('room-1', 'enr-1');
  });

  it('says no for a private room the viewer has left', async () => {
    const d = deps({ findMembership: jest.fn(async () => ({ access_state: 'removed' } as never)) });
    expect(await resolveRoomEligibility('room-1', VIEWER, d)).toBe(false);
  });

  it('says no for a private room with no membership row', async () => {
    expect(await resolveRoomEligibility('room-1', VIEWER, deps())).toBe(false);
  });
});

describe('it defers to the canonical room gate rather than inventing a rule', () => {
  it('lets anyone into a public room', async () => {
    const d = deps({ findRoom: jest.fn(async () => room({ privacy: 'public' }) as never) });
    expect(await resolveRoomEligibility('room-1', VIEWER, d)).toBe(true);
  });

  it('matches a cohort room by the viewer cohort, with no membership row', async () => {
    const d = deps({ findRoom: jest.fn(async () => room({ privacy: 'cohort', linked_cohort_id: 'coh-1' }) as never) });
    expect(await resolveRoomEligibility('room-1', VIEWER, d)).toBe(true);
  });

  it('refuses a cohort room belonging to a different cohort', async () => {
    const d = deps({ findRoom: jest.fn(async () => room({ privacy: 'cohort', linked_cohort_id: 'coh-OTHER' }) as never) });
    expect(await resolveRoomEligibility('room-1', VIEWER, d)).toBe(false);
  });

  it('admits an admin anywhere, which is the room gate short-circuit, not a local one', async () => {
    const d = deps();
    expect(await resolveRoomEligibility('room-1', { ...VIEWER, isAdmin: true }, d)).toBe(true);
  });

  it('refuses an unknown privacy value instead of defaulting open', async () => {
    const d = deps({ findRoom: jest.fn(async () => room({ privacy: 'something_new' }) as never) });
    expect(await resolveRoomEligibility('room-1', VIEWER, d)).toBe(false);
  });
});

describe('it fails CLOSED', () => {
  it('says no, and logs, when the room read rejects', async () => {
    const log = jest.fn();
    const d = deps({ findRoom: jest.fn(async () => { throw new Error('connection reset'); }), log });

    expect(await resolveRoomEligibility('room-1', VIEWER, d)).toBe(false);

    expect(log).toHaveBeenCalledTimes(1);
    const line = JSON.parse((log as jest.Mock).mock.calls[0][0]);
    expect(line).toMatchObject({
      level: 'error', outcome: 'failure', event: 'broadcast_room_eligibility_failed',
    });
    // The driver message can carry a connection string; only the class is logged.
    expect((log as jest.Mock).mock.calls[0][0]).not.toContain('connection reset');
  });

  it('says no when the MEMBERSHIP read rejects, not just the room read', async () => {
    const d = deps({ findMembership: jest.fn(async () => { throw new Error('timeout'); }) });
    expect(await resolveRoomEligibility('room-1', VIEWER, d)).toBe(false);
  });
});
