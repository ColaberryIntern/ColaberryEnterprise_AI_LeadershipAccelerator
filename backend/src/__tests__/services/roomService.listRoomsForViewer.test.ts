/**
 * listRoomsForViewer's room_type exclusion (2026-07-31) — 'dm' and
 * 'scheduled' rooms don't belong in the general Rooms browse rail: DMs are
 * reached via the chat dock, class rooms via Today/Classroom/Schedule/the
 * topbar pill or /portal/sessions. Every DM ever opened had been piling up
 * in the rail forever, all sharing the hardcoded name "Direct message".
 */

jest.mock('../../services/communityRooms/roomOutboxService', () => ({ emitRoomEvent: jest.fn() }));
jest.mock('../../models/CommunityRoom', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../models/RoomMembership', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../models/RoomBooking', () => ({ __esModule: true, default: {} }));
jest.mock('../../models/RoomMessage', () => ({ __esModule: true, default: {} }));
jest.mock('../../models/LiveSession', () => ({ __esModule: true, default: {} }));

import { Op } from 'sequelize';
import CommunityRoom from '../../models/CommunityRoom';
import RoomMembership from '../../models/RoomMembership';
import { listRoomsForViewer } from '../../services/communityRooms/roomService';
import type { RoomAccessContext } from '../../services/communityRooms/roomEntitlementService';

const communityRoomFindAll = (CommunityRoom as any).findAll as jest.Mock;
const roomMembershipFindAll = (RoomMembership as any).findAll as jest.Mock;

const ctx: RoomAccessContext = { enrollmentId: 'e1', cohortId: 'c1' };

beforeEach(() => {
  jest.clearAllMocks();
  communityRoomFindAll.mockResolvedValue([]);
  roomMembershipFindAll.mockResolvedValue([]);
});

describe('listRoomsForViewer', () => {
  it('excludes dm and scheduled room_types from the query', async () => {
    await listRoomsForViewer(ctx);

    const where = communityRoomFindAll.mock.calls[0][0].where;
    expect(where.room_type[Op.notIn as unknown as string]).toEqual(['dm', 'scheduled']);
  });

  it('still allows other room types through the query filter (category still applies)', async () => {
    await listRoomsForViewer(ctx, { category: 'social' });

    const where = communityRoomFindAll.mock.calls[0][0].where;
    expect(where.category).toBe('social');
    expect(where.room_type[Op.notIn as unknown as string]).toEqual(['dm', 'scheduled']);
  });
});
