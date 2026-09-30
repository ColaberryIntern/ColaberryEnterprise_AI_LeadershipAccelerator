const mockMembershipFindAll = jest.fn();
jest.mock('../../../models/RoomMembership', () => ({ __esModule: true, default: { findAll: (...a: any[]) => mockMembershipFindAll(...a) } }));

const mockRoomFindAll = jest.fn();
jest.mock('../../../models/CommunityRoom', () => ({ __esModule: true, default: { findAll: (...a: any[]) => mockRoomFindAll(...a) } }));

const mockTicketFindAll = jest.fn();
jest.mock('../../../models/Ticket', () => ({ __esModule: true, default: { findAll: (...a: any[]) => mockTicketFindAll(...a) } }));

import { getTicketsInterventionsField } from '../ticketsInterventionsSource';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getTicketsInterventionsField', () => {
  it('happy path: real tickets found via the real enrollment -> RoomMembership -> dm room -> Ticket join path', async () => {
    mockMembershipFindAll.mockResolvedValue([{ room_id: 'room-1' }]);
    mockRoomFindAll.mockResolvedValue([{ id: 'room-1' }]);
    mockTicketFindAll.mockResolvedValue([
      { id: 't1', title: 'Falling behind on Week 3', status: 'in_progress', type: 'student_support', updated_at: new Date('2026-09-01') },
      { id: 't2', title: 'Earlier check-in', status: 'done', type: 'student_support', updated_at: new Date('2026-08-01') },
    ]);

    const field = await getTicketsInterventionsField('enrollment-1');

    expect(field.status).toBe('known');
    expect(field.value?.openCount).toBe(1);
    expect(field.value?.totalCount).toBe(2);
    expect(field.value?.recentTickets[0].title).toBe('Falling behind on Week 3');
    const call = mockTicketFindAll.mock.calls[0][0];
    expect(call.where.entity_type).toBe('community_room');
  });

  it('honesty boundary: no room memberships at all is a real known empty state, never queries Ticket', async () => {
    mockMembershipFindAll.mockResolvedValue([]);

    const field = await getTicketsInterventionsField('enrollment-1');

    expect(field.status).toBe('known');
    expect(field.value).toEqual({ openCount: 0, totalCount: 0, recentTickets: [] });
    expect(mockTicketFindAll).not.toHaveBeenCalled();
  });

  it('honesty boundary: memberships exist but none are in a real dm-type room — no tickets queried', async () => {
    mockMembershipFindAll.mockResolvedValue([{ room_id: 'room-1' }]);
    mockRoomFindAll.mockResolvedValue([]); // room-1 wasn't a real dm room

    const field = await getTicketsInterventionsField('enrollment-1');

    expect(field.value).toEqual({ openCount: 0, totalCount: 0, recentTickets: [] });
    expect(mockTicketFindAll).not.toHaveBeenCalled();
  });
});
