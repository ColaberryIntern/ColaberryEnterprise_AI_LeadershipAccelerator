/**
 * buildTicketFilterWhere() — a standalone module (ticketFilters.ts) precisely
 * so getTicketsForBoard() (ticketService.ts) and getTicketStats()
 * (ticketStatsService.ts) can both depend on it without a circular import
 * between those two (ticketService.ts re-exports getTicketStats from
 * ticketStatsService.ts). Pure function, no I/O, no model mocking needed —
 * these tests are the load-bearing contract for BOTH the board query and the
 * KPI stats query (Ticket KPI filter-scoping fix, 2026-08-25).
 */
import { Op } from 'sequelize';
import { buildTicketFilterWhere } from '../ticketFilters';

describe('buildTicketFilterWhere', () => {
  it('boundary: no filters at all -> an empty where clause (matches every ticket)', () => {
    expect(buildTicketFilterWhere(undefined)).toEqual({});
    expect(buildTicketFilterWhere({})).toEqual({});
  });

  it('a single status value applies directly, not wrapped in Op.in', () => {
    const where = buildTicketFilterWhere({ status: 'in_progress' });
    expect(where.status).toBe('in_progress');
  });

  it('an array of statuses wraps in Op.in', () => {
    const where = buildTicketFilterWhere({ status: ['todo', 'in_progress'] });
    expect(where.status).toEqual({ [Op.in]: ['todo', 'in_progress'] });
  });

  it('priority and type follow the same single-vs-array rule as status', () => {
    const where = buildTicketFilterWhere({ priority: 'critical', type: ['bug', 'task'] });
    expect(where.priority).toBe('critical');
    expect(where.type).toEqual({ [Op.in]: ['bug', 'task'] });
  });

  it('source and assigned_to_id apply as direct equality', () => {
    const where = buildTicketFilterWhere({ source: 'reese_autonomous_outreach', assigned_to_id: 'admin-1' });
    expect(where.source).toBe('reese_autonomous_outreach');
    expect(where.assigned_to_id).toBe('admin-1');
  });

  it('createdAfter maps to created_at with Op.gte', () => {
    const cutoff = new Date('2026-08-01T00:00:00Z');
    const where = buildTicketFilterWhere({ createdAfter: cutoff });
    expect(where.created_at).toEqual({ [Op.gte]: cutoff });
  });

  it('creatorMatchIds builds an Op.or matching EITHER created_by_id or assigned_to_id — the exact real filter behind the Creator dropdown', () => {
    const where = buildTicketFilterWhere({ creatorMatchIds: ['agent-reese', 'admin-reese'] });
    expect(where[Op.or as any]).toEqual([
      { created_by_id: { [Op.in]: ['agent-reese', 'admin-reese'] } },
      { assigned_to_id: { [Op.in]: ['agent-reese', 'admin-reese'] } },
    ]);
  });

  it('boundary: an empty creatorMatchIds array is treated as "no creator filter", never an impossible Op.in([])', () => {
    const where = buildTicketFilterWhere({ creatorMatchIds: [] });
    expect(where[Op.or as any]).toBeUndefined();
  });

  it('composes multiple filters together in one call (priority + creator, mirroring the real board/stats fetch)', () => {
    const where = buildTicketFilterWhere({ priority: 'critical', creatorMatchIds: ['agent-reese'] });
    expect(where.priority).toBe('critical');
    expect(where[Op.or as any]).toBeDefined();
  });

  it('parent_ticket_id: explicit null is applied (distinct from "not filtered at all")', () => {
    const where = buildTicketFilterWhere({ parent_ticket_id: null });
    expect(where.parent_ticket_id).toBeNull();
    expect('parent_ticket_id' in buildTicketFilterWhere({})).toBe(false);
  });
});
