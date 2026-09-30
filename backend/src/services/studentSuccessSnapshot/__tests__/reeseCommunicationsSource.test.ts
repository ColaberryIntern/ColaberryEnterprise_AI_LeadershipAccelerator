const mockGetReeseEnrollmentId = jest.fn();
jest.mock('../../reese/reeseIdentitySeed', () => ({ getReeseEnrollmentId: (...a: any[]) => mockGetReeseEnrollmentId(...a) }));

const mockMembershipFindAll = jest.fn();
jest.mock('../../../models/RoomMembership', () => ({ __esModule: true, default: { findAll: (...a: any[]) => mockMembershipFindAll(...a) } }));

const mockRoomFindAll = jest.fn();
jest.mock('../../../models/CommunityRoom', () => ({ __esModule: true, default: { findAll: (...a: any[]) => mockRoomFindAll(...a) } }));

const mockMessageFindAll = jest.fn();
jest.mock('../../../models/RoomMessage', () => ({ __esModule: true, default: { findAll: (...a: any[]) => mockMessageFindAll(...a) } }));

import { getPreviousReeseCommunicationsField } from '../reeseCommunicationsSource';

const REESE_ENROLLMENT_ID = 'reese-enrollment-1';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetReeseEnrollmentId.mockResolvedValue(REESE_ENROLLMENT_ID);
});

describe('getPreviousReeseCommunicationsField', () => {
  it('happy path: finds the real shared DM room between the student and Reese specifically, never another agent\'s room', async () => {
    mockMembershipFindAll
      .mockResolvedValueOnce([{ room_id: 'room-shared' }, { room_id: 'room-other-staff' }]) // student's rooms
      .mockResolvedValueOnce([{ room_id: 'room-shared' }]); // Reese's rooms
    mockRoomFindAll.mockResolvedValue([{ id: 'room-shared' }]);
    mockMessageFindAll.mockResolvedValue([
      { id: 'm1', enrollment_id: REESE_ENROLLMENT_ID, created_at: new Date('2026-09-04') },
      { id: 'm2', enrollment_id: 'enrollment-1', created_at: new Date('2026-09-03') },
    ]);

    const field = await getPreviousReeseCommunicationsField('enrollment-1');

    expect(field.status).toBe('known');
    expect(field.value?.messageCount).toBe(2);
    expect(field.value?.recentMessages[0].isFromReese).toBe(true);
    // Never room-other-staff — the intersection excludes any room Reese isn't in.
    const roomIdFilter = mockRoomFindAll.mock.calls[0][0].where.id;
    const roomIds = roomIdFilter[Object.getOwnPropertySymbols(roomIdFilter)[0]];
    expect(roomIds).toEqual(['room-shared']);
  });

  it('honesty boundary: no shared room with Reese is a real known empty state, never another room\'s messages', async () => {
    mockMembershipFindAll
      .mockResolvedValueOnce([{ room_id: 'room-other-staff' }])
      .mockResolvedValueOnce([{ room_id: 'room-reese-only' }]);

    const field = await getPreviousReeseCommunicationsField('enrollment-1');

    expect(field.status).toBe('known');
    expect(field.value).toEqual({ messageCount: 0, lastMessageAt: null, recentMessages: [] });
    expect(mockMessageFindAll).not.toHaveBeenCalled();
  });

  it('fail-safe: Reese\'s own identity cannot be resolved returns unknown, never crashes or leaks another agent\'s messages', async () => {
    mockGetReeseEnrollmentId.mockResolvedValue(null);

    const field = await getPreviousReeseCommunicationsField('enrollment-1');

    expect(field.status).toBe('unknown');
    expect(mockMembershipFindAll).not.toHaveBeenCalled();
  });

  it('message body content is never included — only enrollment id, sender flag, and timestamp', async () => {
    mockMembershipFindAll.mockResolvedValueOnce([{ room_id: 'room-shared' }]).mockResolvedValueOnce([{ room_id: 'room-shared' }]);
    mockRoomFindAll.mockResolvedValue([{ id: 'room-shared' }]);
    mockMessageFindAll.mockResolvedValue([{ id: 'm1', enrollment_id: REESE_ENROLLMENT_ID, content: 'a real private message body', created_at: new Date() }]);

    const field = await getPreviousReeseCommunicationsField('enrollment-1');

    expect(JSON.stringify(field.value)).not.toContain('a real private message body');
  });
});
