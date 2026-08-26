/**
 * ticketStatsService — Ticket KPI filter-scoping fix (2026-08-25). Ali, live,
 * filtering the board by Creator: "When we filter down on a list the KPIs
 * should reflect what the data is showing." getTicketStats() now takes the
 * same optional TicketFilters shape getTicketsForBoard() already did, and
 * applies it to all 4 aggregate queries via the shared buildTicketFilterWhere().
 */
jest.mock('../../models', () => ({ Ticket: { count: jest.fn(), findAll: jest.fn() } }));

import { Op } from 'sequelize';
import { Ticket } from '../../models';
import { getTicketStats } from '../ticketStatsService';

const mockCount = Ticket.count as unknown as jest.Mock;
const mockFindAll = Ticket.findAll as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockCount.mockResolvedValue(0);
  mockFindAll.mockResolvedValue([]);
});

describe('getTicketStats', () => {
  it('backward compat: called with no arguments, queries with an empty where (true global totals, unchanged for every pre-existing caller)', async () => {
    await getTicketStats();

    expect(mockCount).toHaveBeenCalledWith({ where: {} });
    const findAllWheres = mockFindAll.mock.calls.map((c) => c[0].where);
    expect(findAllWheres).toEqual([{}, {}, {}]);
  });

  it('a creator filter is applied to ALL FOUR aggregate queries (total, status, priority, type), not just the board', async () => {
    await getTicketStats({ creatorMatchIds: ['agent-reese', 'admin-reese'] });

    const expectedOr = [
      { created_by_id: { [Op.in]: ['agent-reese', 'admin-reese'] } },
      { assigned_to_id: { [Op.in]: ['agent-reese', 'admin-reese'] } },
    ];
    expect(mockCount).toHaveBeenCalledWith({ where: { [Op.or]: expectedOr } });
    for (const call of mockFindAll.mock.calls) {
      expect(call[0].where).toEqual({ [Op.or]: expectedOr });
    }
  });

  it('composes a creator filter with a priority filter in the same call, matching what the board endpoint already does', async () => {
    await getTicketStats({ priority: 'critical', creatorMatchIds: ['agent-reese'] });

    const where = mockCount.mock.calls[0][0].where;
    expect(where.priority).toBe('critical');
    expect(where[Op.or as any]).toBeDefined();
  });

  it('computes the real returned shape (total/open/byStatus/byPriority/byType) from the (now filtered) aggregate rows, unchanged contract', async () => {
    mockCount.mockResolvedValue(15);
    mockFindAll
      .mockResolvedValueOnce([{ status: 'backlog', count: '12' }, { status: 'in_progress', count: '3' }]) // status
      .mockResolvedValueOnce([{ priority: 'medium', count: '15' }]) // priority
      .mockResolvedValueOnce([{ type: 'student_support', count: '15' }]); // type

    const result = await getTicketStats({ creatorMatchIds: ['agent-reese'] });

    expect(result).toEqual({
      total: 15,
      open: 15, // backlog(12) + in_progress(3), matching the screenshot's real Reese-filtered board
      byStatus: { backlog: 12, in_progress: 3 },
      byPriority: { medium: 15 },
      byType: { student_support: 15 },
    });
  });

  it('boundary: an empty creatorMatchIds array behaves as "no creator filter" (matches buildTicketFilterWhere\'s own contract)', async () => {
    await getTicketStats({ creatorMatchIds: [] });

    expect(mockCount).toHaveBeenCalledWith({ where: {} });
  });
});
