/**
 * Reese student_support Ticket Supersession — unit tests. Mirrors
 * corybrainInitiativeTicketAutoResolver.test.ts's mocking shape (mock '../../models'
 * and the dynamically-imported sibling modules), since this file uses the exact same
 * dynamic-import convention.
 */
import { Op } from 'sequelize';

const mockTicketFindAll = jest.fn();
const mockUpdateTicketStatus = jest.fn();
const mockGetReeseAdminUserId = jest.fn();

jest.mock('../../../models', () => ({
  Ticket: { findAll: (...args: any[]) => mockTicketFindAll(...args) },
}));
jest.mock('../../../services/company/ticketOrchestrator', () => ({
  updateTicketStatus: (...args: any[]) => mockUpdateTicketStatus(...args),
}));
jest.mock('../../../services/reese/reeseIdentitySeed', () => ({
  getReeseAdminUserId: (...args: any[]) => mockGetReeseAdminUserId(...args),
}));

import {
  fetchLiveResolvableStudentSupportTickets,
  resolveReeseStudentSupportSupersession,
  MAX_TICKETS_PER_RUN,
} from '../reeseStudentSupportSupersessionResolver';

const REESE_ADMIN_ID = '82c2dfd2-369e-4545-8d2f-22d1ae3451ff';

function ticketRow(overrides: Partial<any> = {}) {
  return {
    id: 'ticket-1',
    entity_id: 'room-1',
    status: 'backlog',
    created_at: new Date('2026-08-09T20:10:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTicketFindAll.mockResolvedValue([]);
  mockUpdateTicketStatus.mockResolvedValue({});
  mockGetReeseAdminUserId.mockResolvedValue(REESE_ADMIN_ID);
});

describe('fetchLiveResolvableStudentSupportTickets — query scope', () => {
  it('scopes the query to Reese\'s real AdminUser id, student_support type, and non-terminal status', async () => {
    await fetchLiveResolvableStudentSupportTickets();

    const whereArg = mockTicketFindAll.mock.calls[0][0].where;
    expect(whereArg.created_by_id).toBe(REESE_ADMIN_ID);
    expect(whereArg.type).toBe('student_support');
    expect(whereArg.status[Op.notIn]).toEqual(['done', 'cancelled']);
    expect(mockTicketFindAll.mock.calls[0][0].limit).toBe(MAX_TICKETS_PER_RUN);
  });

  it('returns an empty result and never queries tickets when Reese\'s identity is not yet seeded', async () => {
    mockGetReeseAdminUserId.mockResolvedValue(null);

    const results = await fetchLiveResolvableStudentSupportTickets();

    expect(results).toEqual([]);
    expect(mockTicketFindAll).not.toHaveBeenCalled();
  });

  it('groups tickets by room (entity_id) — a ticket in a 2-ticket room sees exactly one sibling', async () => {
    mockTicketFindAll.mockResolvedValue([
      ticketRow({ id: 'old', entity_id: 'room-A', created_at: new Date('2026-08-09T00:00:00.000Z') }),
      ticketRow({ id: 'new', entity_id: 'room-A', created_at: new Date('2026-08-11T00:00:00.000Z') }),
      ticketRow({ id: 'sole', entity_id: 'room-B', created_at: new Date('2026-08-10T00:00:00.000Z') }),
    ]);

    const results = await fetchLiveResolvableStudentSupportTickets();

    expect(results.find((r) => r.ticket_id === 'old')?.outcome).toBe('superseded');
    expect(results.find((r) => r.ticket_id === 'old')?.superseded_by_ticket_id).toBe('new');
    expect(results.find((r) => r.ticket_id === 'new')?.outcome).toBe('current');
    expect(results.find((r) => r.ticket_id === 'sole')?.outcome).toBe('sole_ticket');
  });

  it('a ticket with a missing entity_id is treated as its own singleton room (never superseded, never supersedes)', async () => {
    mockTicketFindAll.mockResolvedValue([
      ticketRow({ id: 'no-room-1', entity_id: null, created_at: new Date('2026-08-09T00:00:00.000Z') }),
      ticketRow({ id: 'no-room-2', entity_id: null, created_at: new Date('2026-08-11T00:00:00.000Z') }),
    ]);

    const results = await fetchLiveResolvableStudentSupportTickets();

    expect(results.every((r) => r.outcome === 'sole_ticket')).toBe(true);
  });

  it('performs zero writes — the read-only half never touches updateTicketStatus', async () => {
    mockTicketFindAll.mockResolvedValue([
      ticketRow({ id: 'old', entity_id: 'room-A', created_at: new Date('2026-08-09T00:00:00.000Z') }),
      ticketRow({ id: 'new', entity_id: 'room-A', created_at: new Date('2026-08-11T00:00:00.000Z') }),
    ]);

    await fetchLiveResolvableStudentSupportTickets();

    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
  });
});

describe('resolveReeseStudentSupportSupersession — writes (happy path)', () => {
  it('closes the superseded (older) ticket to done, leaves the current (newer) one untouched, comment names the newer ticket', async () => {
    mockTicketFindAll.mockResolvedValue([
      ticketRow({ id: 'old', entity_id: 'room-A', created_at: new Date('2026-08-09T00:00:00.000Z') }),
      ticketRow({ id: 'new', entity_id: 'room-A', created_at: new Date('2026-08-11T00:00:00.000Z') }),
    ]);

    const report = await resolveReeseStudentSupportSupersession();

    expect(mockUpdateTicketStatus).toHaveBeenCalledTimes(1);
    const [ticketId, newStatus, actorType, actorId, comment] = mockUpdateTicketStatus.mock.calls[0];
    expect(ticketId).toBe('old');
    expect(newStatus).toBe('done');
    expect(actorType).toBe('ai_staff');
    expect(actorId).toBe(REESE_ADMIN_ID);
    expect(comment).toEqual(expect.stringContaining('new'));
    expect(report.closed).toBe(1);
    expect(report.breakdown.superseded).toEqual({ checked: 1, closed: 1 });
    expect(report.breakdown.current).toEqual({ checked: 1, closed: 0 });
  });
});

describe('resolveReeseStudentSupportSupersession — null actor id guard', () => {
  it('falls back to the literal "Reese" actor id when getReeseAdminUserId() resolves null, and still completes the run', async () => {
    mockGetReeseAdminUserId.mockResolvedValue(null);
    mockTicketFindAll.mockResolvedValue([]);

    const report = await resolveReeseStudentSupportSupersession();

    // Query itself short-circuits to [] when identity isn't seeded (see the fetch
    // test above) — so this asserts the resolver as a whole never throws and never
    // passes a null actorId anywhere, end to end.
    expect(report.checked).toBe(0);
    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
  });

  it('uses the "Reese" string fallback as actorId on a real write when the resolver\'s own identity lookup resolves null even though the query\'s own (separate) lookup found real candidates', async () => {
    // resolveReeseStudentSupportSupersession() resolves the actor id itself (call 1,
    // used for the write) BEFORE calling fetchLiveResolvableStudentSupportTickets(),
    // which resolves the SAME id independently for its own query scope (call 2).
    // Mocking call 1 -> null / call 2 -> a real id exercises the write-path fallback
    // on an actual close, proving actorId is never a bare null on a real write even
    // in this (deliberately adversarial, not expected in production) split-result
    // scenario.
    mockGetReeseAdminUserId.mockResolvedValueOnce(null).mockResolvedValueOnce(REESE_ADMIN_ID);
    mockTicketFindAll.mockResolvedValue([
      ticketRow({ id: 'old', entity_id: 'room-A', created_at: new Date('2026-08-09T00:00:00.000Z') }),
      ticketRow({ id: 'new', entity_id: 'room-A', created_at: new Date('2026-08-11T00:00:00.000Z') }),
    ]);

    await resolveReeseStudentSupportSupersession();

    expect(mockUpdateTicketStatus).toHaveBeenCalledTimes(1);
    const [, , , actorId] = mockUpdateTicketStatus.mock.calls[0];
    expect(actorId).toBe('Reese');
    expect(actorId).not.toBeNull();
  });
});

describe('resolveReeseStudentSupportSupersession — boundary', () => {
  it('a sole ticket in its room produces zero writes', async () => {
    mockTicketFindAll.mockResolvedValue([ticketRow({ id: 'sole', entity_id: 'room-B' })]);

    const report = await resolveReeseStudentSupportSupersession();

    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
    expect(report.closed).toBe(0);
    expect(report.breakdown.sole_ticket).toEqual({ checked: 1, closed: 0 });
  });

  it('an already-done/cancelled ticket is excluded by the query itself, never reaching the classifier', async () => {
    await resolveReeseStudentSupportSupersession();

    const whereArg = mockTicketFindAll.mock.calls[0][0].where;
    expect(whereArg.status[Op.notIn]).toEqual(['done', 'cancelled']);
  });
});

describe('resolveReeseStudentSupportSupersession — idempotency', () => {
  it('running twice where the first run already closed the superseded ticket results in zero writes on the second run', async () => {
    mockTicketFindAll
      .mockResolvedValueOnce([
        ticketRow({ id: 'old', entity_id: 'room-A', created_at: new Date('2026-08-09T00:00:00.000Z') }),
        ticketRow({ id: 'new', entity_id: 'room-A', created_at: new Date('2026-08-11T00:00:00.000Z') }),
      ])
      // 2nd fetch: query's own status filter already excludes 'old' once it's done —
      // only the still-open 'new' ticket remains, which has no siblings now.
      .mockResolvedValueOnce([ticketRow({ id: 'new', entity_id: 'room-A', created_at: new Date('2026-08-11T00:00:00.000Z') })]);

    const firstRun = await resolveReeseStudentSupportSupersession();
    const secondRun = await resolveReeseStudentSupportSupersession();

    expect(firstRun.closed).toBe(1);
    expect(secondRun.closed).toBe(0);
    expect(mockUpdateTicketStatus).toHaveBeenCalledTimes(1);
  });
});

describe('resolveReeseStudentSupportSupersession — failure isolation', () => {
  it('one write failure does not abort processing of the rest of the batch', async () => {
    mockTicketFindAll.mockResolvedValue([
      ticketRow({ id: 'old-1', entity_id: 'room-A', created_at: new Date('2026-08-09T00:00:00.000Z') }),
      ticketRow({ id: 'new-1', entity_id: 'room-A', created_at: new Date('2026-08-11T00:00:00.000Z') }),
      ticketRow({ id: 'old-2', entity_id: 'room-B', created_at: new Date('2026-08-09T00:00:00.000Z') }),
      ticketRow({ id: 'new-2', entity_id: 'room-B', created_at: new Date('2026-08-11T00:00:00.000Z') }),
    ]);
    mockUpdateTicketStatus.mockRejectedValueOnce(new Error('DB write failed')).mockResolvedValueOnce({});

    const report = await resolveReeseStudentSupportSupersession();

    expect(report.results.find((r) => r.ticket_id === 'old-1')?.write_error).toBe('DB write failed');
    expect(report.results.find((r) => r.ticket_id === 'old-2')?.write_error).toBeUndefined();
    expect(report.closed).toBe(1);
  });
});
