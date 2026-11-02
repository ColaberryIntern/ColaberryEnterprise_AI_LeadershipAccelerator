/**
 * A user-created video room gets its own Zoom host too.
 *
 * `joinVideoRoom` mints a room's persistent, year-long meeting on first join. It passed
 * no host, so every such room's meeting belonged to the one `ZOOM_HOST_EMAIL` — the
 * same identity already carrying the interns standup and the public AI session. A Zoom
 * user hosts one meeting at a time, so each new room made the collision worse: more
 * rooms, one host, and only one of them able to be live.
 *
 * These pin the threading and, just as importantly, that a pool which is absent or
 * broken leaves joining a room exactly as it was.
 */
jest.mock('../../services/communityRooms/roomOutboxService', () => ({ emitRoomEvent: jest.fn() }));
jest.mock('../../models/CommunityRoom', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../models/RoomMembership', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../models/RoomBooking', () => ({ __esModule: true, default: {} }));
jest.mock('../../models/RoomMessage', () => ({ __esModule: true, default: {} }));
jest.mock('../../models/LiveSession', () => ({ __esModule: true, default: {} }));
jest.mock('../../services/communityRooms/roomEntitlementService', () => ({
  ...jest.requireActual('../../services/communityRooms/roomEntitlementService'),
  canJoinMeeting: jest.fn(() => true),
}));
jest.mock('../../services/communityRooms/meetingProvider', () => ({ getMeetingProvider: jest.fn() }));
jest.mock('../../services/zoom/roomHostAllocator', () => ({ reserveRoomHost: jest.fn() }));

import CommunityRoom from '../../models/CommunityRoom';
import RoomMembership from '../../models/RoomMembership';
import { getMeetingProvider } from '../../services/communityRooms/meetingProvider';
import { reserveRoomHost } from '../../services/zoom/roomHostAllocator';
import { joinVideoRoom } from '../../services/communityRooms/roomService';
import type { RoomAccessContext } from '../../services/communityRooms/roomEntitlementService';

const findByPk = (CommunityRoom as any).findByPk as jest.Mock;
const membershipFindOne = (RoomMembership as any).findOne as jest.Mock;
const providerFactory = getMeetingProvider as jest.Mock;
const reserve = reserveRoomHost as unknown as jest.Mock;

const ctx: RoomAccessContext = { enrollmentId: 'e1', cohortId: 'c1' };

let createMeeting: jest.Mock;

/** An unminted video room plus the provider that will mint it. */
function givenRoom(overrides: Record<string, unknown> = {}) {
  const update = jest.fn().mockResolvedValue(undefined);
  findByPk.mockResolvedValue({
    id: 'room-1', is_video: true, status: 'active', name: 'Practice',
    description: null, meeting_link: null, update, ...overrides,
  });
  return update;
}

beforeEach(() => {
  jest.clearAllMocks();
  membershipFindOne.mockResolvedValue({ access_state: 'active', role: 'member' });
  createMeeting = jest.fn().mockResolvedValue({ providerEventId: 'z1', joinUrl: 'https://zoom.us/j/1' });
  providerFactory.mockReturnValue({ createMeeting });
});

describe('joinVideoRoom host threading', () => {
  it('mints the room under the host reserved for it', async () => {
    reserve.mockResolvedValue('spare@colaberry.com');
    givenRoom();

    await joinVideoRoom(ctx, 'room-1');

    expect(reserve).toHaveBeenCalledWith('room-1');
    expect(createMeeting).toHaveBeenCalledWith(
      expect.objectContaining({ hostEmail: 'spare@colaberry.com' }),
    );
  });

  it('sends NO host when no pool is configured, exactly as before', async () => {
    // The regression guard: an explicit `hostEmail: undefined` is not the same as
    // omitting the key, and the provider only falls back when the key is absent.
    reserve.mockResolvedValue(null);
    givenRoom();

    await joinVideoRoom(ctx, 'room-1');

    expect(createMeeting).toHaveBeenCalledTimes(1);
    expect(createMeeting.mock.calls[0][0]).not.toHaveProperty('hostEmail');
  });

  it('keeps the stable request id, so a lost response still cannot duplicate', async () => {
    // Host threading must not disturb the idempotency key the ledger is built on.
    reserve.mockResolvedValue('spare@colaberry.com');
    givenRoom();

    await joinVideoRoom(ctx, 'room-1');

    expect(createMeeting.mock.calls[0][0].requestId).toBe('room-room-1');
  });

  it('does not reserve a host for a room that already has a link (idempotency)', async () => {
    // The link is already live on whichever host minted it; asking again could only
    // produce a different answer, and nothing would act on it.
    givenRoom({ meeting_link: 'https://zoom.us/j/EXISTING' });

    const result = await joinVideoRoom(ctx, 'room-1');

    expect(result).toEqual({ join_url: 'https://zoom.us/j/EXISTING' });
    expect(reserve).not.toHaveBeenCalled();
    expect(createMeeting).not.toHaveBeenCalled();
  });
});
