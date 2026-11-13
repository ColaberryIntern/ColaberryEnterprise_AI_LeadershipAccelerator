/**
 * joinVideoRoom self-heal (2026-11-13, AI Friday "Invalid meeting ID").
 * A stored room link is replaced ONLY when Zoom says the meeting is gone; any
 * other health answer keeps it. Replacement is idempotent across concurrent
 * joiners because its request id is keyed on the dead meeting.
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
jest.mock('../../services/zoom/roomHostAllocator', () => ({ reserveRoomHost: jest.fn(async () => null) }));
jest.mock('../../services/communityRooms/roomLinkHealth', () => ({ checkRoomLink: jest.fn() }));

import CommunityRoom from '../../models/CommunityRoom';
import RoomMembership from '../../models/RoomMembership';
import { getMeetingProvider } from '../../services/communityRooms/meetingProvider';
import { checkRoomLink } from '../../services/communityRooms/roomLinkHealth';
import { joinVideoRoom } from '../../services/communityRooms/roomService';
import type { RoomAccessContext } from '../../services/communityRooms/roomEntitlementService';

const findByPk = (CommunityRoom as any).findByPk as jest.Mock;
const findMembership = (RoomMembership as any).findOne as jest.Mock;
const providerFactory = getMeetingProvider as jest.Mock;
const health = checkRoomLink as jest.Mock;

const ctx: RoomAccessContext = { enrollmentId: 'e1', cohortId: 'c1' };
const DEAD = 'https://colaberry.zoom.us/j/86221767778?pwd=x';

function roomWith(link: string | null) {
  return { id: 'room-1', is_video: true, status: 'active', name: 'Colaberry AI Sessions', meeting_link: link, update: jest.fn().mockResolvedValue(undefined) };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  findMembership.mockResolvedValue({ access_state: 'active', role: 'member' });
});

describe('joinVideoRoom self-heal', () => {
  it.each(['alive', 'unknown'])('keeps the stored link when health is %s and never mints', async (status) => {
    findByPk.mockResolvedValue(roomWith(DEAD));
    health.mockResolvedValue(status);
    await expect(joinVideoRoom(ctx, 'room-1')).resolves.toEqual({ join_url: DEAD });
    expect(providerFactory).not.toHaveBeenCalled();
  });

  it('replaces a dead link, keyed on the dead meeting id, and stores the new one', async () => {
    const room = roomWith(DEAD);
    findByPk.mockResolvedValue(room);
    health.mockResolvedValue('dead');
    const createMeeting = jest.fn().mockResolvedValue({ providerEventId: '999', joinUrl: 'https://colaberry.zoom.us/j/999' });
    providerFactory.mockReturnValue({ createMeeting });

    await expect(joinVideoRoom(ctx, 'room-1')).resolves.toEqual({ join_url: 'https://colaberry.zoom.us/j/999' });
    expect(createMeeting).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'room-room-1-heal-86221767778' }));
    expect(room.update).toHaveBeenCalledWith({ meeting_link: 'https://colaberry.zoom.us/j/999' });
  });

  it('returns null (never the dead link) when the replacement mint yields no link', async () => {
    const room = roomWith(DEAD);
    findByPk.mockResolvedValue(room);
    health.mockResolvedValue('dead');
    providerFactory.mockReturnValue({ createMeeting: jest.fn().mockResolvedValue({ providerEventId: '', joinUrl: null }) });

    await expect(joinVideoRoom(ctx, 'room-1')).resolves.toEqual({ join_url: null });
    expect(room.update).not.toHaveBeenCalled();
  });

  it('first join (no link) still uses the original room request id and skips the health check', async () => {
    findByPk.mockResolvedValue(roomWith(null));
    const createMeeting = jest.fn().mockResolvedValue({ providerEventId: '1', joinUrl: 'https://zoom.us/j/1' });
    providerFactory.mockReturnValue({ createMeeting });

    await joinVideoRoom(ctx, 'room-1');
    expect(health).not.toHaveBeenCalled();
    expect(createMeeting).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'room-room-1' }));
  });
});
