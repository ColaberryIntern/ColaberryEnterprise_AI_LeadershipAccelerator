/**
 * joinVideoRoom (2026-08-04) — regression test for a real bug caught live:
 * this function hardcoded `getMeetingProvider('google_meet')` for every
 * always-open video room (the "+ New room" video-room type, e.g. the
 * cohort's persistent room), so "Join Video Call" kept minting Google Meet
 * links even after the rest of the app (meetingService.ts,
 * roomBookingService.ts) had switched to Zoom. Fixed by calling
 * getMeetingProvider() with no argument, deferring to the factory's default.
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

import CommunityRoom from '../../models/CommunityRoom';
import RoomMembership from '../../models/RoomMembership';
import { getMeetingProvider } from '../../services/communityRooms/meetingProvider';
import { joinVideoRoom } from '../../services/communityRooms/roomService';
import type { RoomAccessContext } from '../../services/communityRooms/roomEntitlementService';

const communityRoomFindByPk = (CommunityRoom as any).findByPk as jest.Mock;
const roomMembershipFindOne = (RoomMembership as any).findOne as jest.Mock;
const getMeetingProviderMock = getMeetingProvider as jest.Mock;

const ctx: RoomAccessContext = { enrollmentId: 'e1', cohortId: 'c1' };

beforeEach(() => {
  jest.clearAllMocks();
  roomMembershipFindOne.mockResolvedValue({ access_state: 'active', role: 'member' });
});

describe('joinVideoRoom', () => {
  it('mints the meeting through getMeetingProvider() with NO explicit provider name — defers to the default (Zoom), never hardcodes google_meet', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    communityRoomFindByPk.mockResolvedValue({
      id: 'room-1', is_video: true, status: 'active', name: 'Cohort Room', meeting_link: null, update,
    });
    getMeetingProviderMock.mockReturnValue({
      createMeeting: jest.fn().mockResolvedValue({ providerEventId: 'zoom-123', joinUrl: 'https://zoom.us/j/123' }),
    });

    const result = await joinVideoRoom(ctx, 'room-1');

    expect(getMeetingProviderMock).toHaveBeenCalledWith(); // no args — the actual bug was passing 'google_meet' here
    expect(result).toEqual({ join_url: 'https://zoom.us/j/123' });
    expect(update).toHaveBeenCalledWith({ meeting_link: 'https://zoom.us/j/123' });
  });

  it('reuses an already-minted link without calling the provider again (the persistent-room property)', async () => {
    communityRoomFindByPk.mockResolvedValue({
      id: 'room-1', is_video: true, status: 'active', name: 'Cohort Room', meeting_link: 'https://zoom.us/j/existing',
    });

    const result = await joinVideoRoom(ctx, 'room-1');

    expect(result).toEqual({ join_url: 'https://zoom.us/j/existing' });
    expect(getMeetingProviderMock).not.toHaveBeenCalled();
  });
});
