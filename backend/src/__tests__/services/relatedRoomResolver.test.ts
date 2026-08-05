/**
 * resolveRelatedRoomIds (2026-07-31) — resolves a RoomBooking's
 * related_live_session_id to the linked class's own Colaberry Commons room
 * (ensureRoomForSession), so RoomFilesPanel's "View class recap" link can
 * route there instead of the retired /portal/sessions/:id page.
 */

jest.mock('../../models/CommunityRoom', () => ({ __esModule: true, default: { findAll: jest.fn() } }));

import { Op } from 'sequelize';
import CommunityRoom from '../../models/CommunityRoom';
import { resolveRelatedRoomIds } from '../../services/communityRooms/relatedRoomResolver';

const communityRoomFindAll = (CommunityRoom as any).findAll as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveRelatedRoomIds', () => {
  it('maps each session id to its linked room id', async () => {
    communityRoomFindAll.mockResolvedValue([
      { id: 'room-1', linked_live_session_id: 'session-1' },
      { id: 'room-2', linked_live_session_id: 'session-2' },
    ]);

    const result = await resolveRelatedRoomIds(['session-1', 'session-2']);

    expect(result.get('session-1')).toBe('room-1');
    expect(result.get('session-2')).toBe('room-2');
  });

  it('silently omits a session with no linked room (predates Community Rooms)', async () => {
    communityRoomFindAll.mockResolvedValue([{ id: 'room-1', linked_live_session_id: 'session-1' }]);

    const result = await resolveRelatedRoomIds(['session-1', 'session-old-no-room']);

    expect(result.has('session-old-no-room')).toBe(false);
    expect(result.size).toBe(1);
  });

  it('returns an empty map without querying for an empty/all-falsy input', async () => {
    const result = await resolveRelatedRoomIds([]);

    expect(result.size).toBe(0);
    expect(communityRoomFindAll).not.toHaveBeenCalled();
  });

  it('de-dupes repeated session ids into a single query', async () => {
    communityRoomFindAll.mockResolvedValue([{ id: 'room-1', linked_live_session_id: 'session-1' }]);

    await resolveRelatedRoomIds(['session-1', 'session-1', 'session-1']);

    const whereArg = communityRoomFindAll.mock.calls[0][0].where.linked_live_session_id;
    expect(whereArg[Op.in as unknown as string]).toEqual(['session-1']);
  });
});
