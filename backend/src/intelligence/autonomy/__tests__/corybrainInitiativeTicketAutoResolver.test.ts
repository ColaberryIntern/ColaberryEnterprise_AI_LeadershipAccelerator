/**
 * CoryBrain Initiative-Ticket Reconciliation — unit tests.
 * Mirrors coryEngineTicketAutoResolver.test.ts's mocking shape (mock '../../models' and
 * the dynamically-imported sibling modules), since this file uses the exact same
 * dynamic-import convention.
 */
import { Op } from 'sequelize';

const mockTicketFindAll = jest.fn();
const mockInitiativeFindAll = jest.fn();
const mockUpdateTicketStatus = jest.fn();

jest.mock('../../../models', () => ({
  Ticket: { findAll: (...args: any[]) => mockTicketFindAll(...args) },
  StrategicInitiative: { findAll: (...args: any[]) => mockInitiativeFindAll(...args) },
}));
jest.mock('../../../services/company/ticketOrchestrator', () => ({
  updateTicketStatus: (...args: any[]) => mockUpdateTicketStatus(...args),
}));

import {
  fetchLiveResolvableCoryBrainInitiativeTickets,
  reCheckAndAutoResolveCoryBrainInitiativeTickets,
  MAX_TICKETS_PER_RUN,
} from '../corybrainInitiativeTicketAutoResolver';

function parentTicket(overrides: Partial<any> = {}) {
  return {
    id: 'parent-1',
    ticket_number: 101,
    parent_ticket_id: null,
    metadata: {},
    status: 'backlog',
    ...overrides,
  };
}

function subtaskTicket(overrides: Partial<any> = {}) {
  return {
    id: 'sub-1',
    ticket_number: 102,
    parent_ticket_id: 'parent-1',
    metadata: { initiative_id: 'init-1' },
    status: 'backlog',
    ...overrides,
  };
}

function initiativeRow(overrides: Partial<any> = {}) {
  return { id: 'init-1', ticket_id: 'parent-1', status: 'cancelled', title: 'Some finding', ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTicketFindAll.mockResolvedValue([]);
  mockInitiativeFindAll.mockResolvedValue([]);
  mockUpdateTicketStatus.mockResolvedValue({});
});

describe('fetchLiveResolvableCoryBrainInitiativeTickets — query scope', () => {
  it('queries only open CoryBrain tickets, no type/source narrowing', async () => {
    await fetchLiveResolvableCoryBrainInitiativeTickets();

    const whereArg = mockTicketFindAll.mock.calls[0][0].where;
    expect(whereArg.created_by_id).toBe('CoryBrain');
    expect(whereArg.type).toBeUndefined();
    expect(whereArg.source).toBeUndefined();
    expect(whereArg.status[Op.notIn]).toEqual(['done', 'cancelled']);
    expect(mockTicketFindAll.mock.calls[0][0].limit).toBe(MAX_TICKETS_PER_RUN);
  });

  it('resolves a parent ticket (parent_ticket_id null) via the REVERSE ticket_id lookup, one batch query', async () => {
    mockTicketFindAll.mockResolvedValue([parentTicket({ id: 'p1' }), parentTicket({ id: 'p2' })]);
    mockInitiativeFindAll.mockResolvedValue([
      initiativeRow({ id: 'i1', ticket_id: 'p1', status: 'cancelled' }),
      initiativeRow({ id: 'i2', ticket_id: 'p2', status: 'completed' }),
    ]);

    const results = await fetchLiveResolvableCoryBrainInitiativeTickets();

    expect(mockInitiativeFindAll).toHaveBeenCalledTimes(1); // one batch query, not one per ticket
    const whereArg = mockInitiativeFindAll.mock.calls[0][0].where;
    expect(whereArg.ticket_id[Op.in]).toEqual(['p1', 'p2']);
    expect(results.find((r) => r.ticket_id === 'p1')?.linked_initiative_status).toBe('cancelled');
    expect(results.find((r) => r.ticket_id === 'p2')?.linked_initiative_status).toBe('completed');
    expect(results.every((r) => r.is_subtask === false)).toBe(true);
  });

  it('resolves a subtask ticket (parent_ticket_id set) via metadata.initiative_id, one batch query for all distinct ids referenced', async () => {
    mockTicketFindAll.mockResolvedValue([
      subtaskTicket({ id: 's1', metadata: { initiative_id: 'i1' } }),
      subtaskTicket({ id: 's2', metadata: { initiative_id: 'i1' } }), // same initiative, should not duplicate the id in the query
      subtaskTicket({ id: 's3', metadata: { initiative_id: 'i2' } }),
    ]);
    mockInitiativeFindAll.mockResolvedValue([
      initiativeRow({ id: 'i1', status: 'cancelled' }),
      initiativeRow({ id: 'i2', status: 'proposed' }),
    ]);

    const results = await fetchLiveResolvableCoryBrainInitiativeTickets();

    expect(mockInitiativeFindAll).toHaveBeenCalledTimes(1);
    const whereArg = mockInitiativeFindAll.mock.calls[0][0].where;
    expect(whereArg.id[Op.in].sort()).toEqual(['i1', 'i2']);
    expect(results.find((r) => r.ticket_id === 's1')?.linked_initiative_status).toBe('cancelled');
    expect(results.find((r) => r.ticket_id === 's3')?.linked_initiative_status).toBe('proposed');
    expect(results.every((r) => r.is_subtask === true)).toBe(true);
  });

  it('mixed batch: parent and subtask tickets resolved independently in the same call, exactly one query per shape', async () => {
    mockTicketFindAll.mockResolvedValue([parentTicket({ id: 'p1' }), subtaskTicket({ id: 's1', metadata: { initiative_id: 'i9' } })]);
    mockInitiativeFindAll
      .mockResolvedValueOnce([initiativeRow({ id: 'iA', ticket_id: 'p1', status: 'completed' })])
      .mockResolvedValueOnce([initiativeRow({ id: 'i9', status: 'cancelled' })]);

    const results = await fetchLiveResolvableCoryBrainInitiativeTickets();

    expect(mockInitiativeFindAll).toHaveBeenCalledTimes(2);
    expect(results.find((r) => r.ticket_id === 'p1')?.outcome).toBe('initiative_completed');
    expect(results.find((r) => r.ticket_id === 's1')?.outcome).toBe('initiative_cancelled');
  });

  it('a subtask with no metadata.initiative_id, or referencing an id with no matching row, resolves to initiative_not_found without throwing', async () => {
    mockTicketFindAll.mockResolvedValue([subtaskTicket({ id: 'orphan', metadata: {} })]);
    mockInitiativeFindAll.mockResolvedValue([]);

    const results = await fetchLiveResolvableCoryBrainInitiativeTickets();

    expect(results[0].outcome).toBe('initiative_not_found');
    expect(results[0].should_close).toBe(false);
  });

  it('a parent ticket with no matching strategic_initiatives row (via ticket_id) resolves to initiative_not_found', async () => {
    mockTicketFindAll.mockResolvedValue([parentTicket({ id: 'orphan-parent' })]);
    mockInitiativeFindAll.mockResolvedValue([]);

    const results = await fetchLiveResolvableCoryBrainInitiativeTickets();

    expect(results[0].outcome).toBe('initiative_not_found');
  });

  it('does not query strategic_initiatives at all when there are zero open tickets', async () => {
    mockTicketFindAll.mockResolvedValue([]);

    await fetchLiveResolvableCoryBrainInitiativeTickets();

    expect(mockInitiativeFindAll).not.toHaveBeenCalled();
  });
});

describe('reCheckAndAutoResolveCoryBrainInitiativeTickets — writes', () => {
  it('closes a cancelled-initiative-linked ticket to cancelled via ticketOrchestrator.updateTicketStatus', async () => {
    mockTicketFindAll.mockResolvedValue([parentTicket({ id: 'p1' })]);
    mockInitiativeFindAll.mockResolvedValue([initiativeRow({ id: 'i1', ticket_id: 'p1', status: 'cancelled' })]);

    const report = await reCheckAndAutoResolveCoryBrainInitiativeTickets();

    expect(mockUpdateTicketStatus).toHaveBeenCalledTimes(1);
    const [ticketId, newStatus, actorType, actorId, comment] = mockUpdateTicketStatus.mock.calls[0];
    expect(ticketId).toBe('p1');
    expect(newStatus).toBe('cancelled');
    expect(actorType).toBe('agent');
    expect(actorId).toBe('CoryBrain');
    expect(typeof comment).toBe('string');
    expect(report.closed).toBe(1);
    expect(report.breakdown.initiative_cancelled).toEqual({ checked: 1, closed: 1 });
  });

  it('closes a completed-initiative-linked subtask ticket to done', async () => {
    mockTicketFindAll.mockResolvedValue([subtaskTicket({ id: 's1', metadata: { initiative_id: 'i1' } })]);
    mockInitiativeFindAll.mockResolvedValue([initiativeRow({ id: 'i1', status: 'completed' })]);

    const report = await reCheckAndAutoResolveCoryBrainInitiativeTickets();

    const [, newStatus] = mockUpdateTicketStatus.mock.calls[0];
    expect(newStatus).toBe('done');
    expect(report.breakdown.initiative_completed).toEqual({ checked: 1, closed: 1 });
  });

  it('a still-active-initiative-linked ticket produces zero writes', async () => {
    mockTicketFindAll.mockResolvedValue([parentTicket({ id: 'p1' })]);
    mockInitiativeFindAll.mockResolvedValue([initiativeRow({ id: 'i1', ticket_id: 'p1', status: 'proposed' })]);

    const report = await reCheckAndAutoResolveCoryBrainInitiativeTickets();

    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
    expect(report.closed).toBe(0);
    expect(report.breakdown.initiative_still_active).toEqual({ checked: 1, closed: 0 });
  });

  it('an unmatched (initiative_not_found) ticket produces zero writes', async () => {
    mockTicketFindAll.mockResolvedValue([parentTicket({ id: 'orphan' })]);
    mockInitiativeFindAll.mockResolvedValue([]);

    const report = await reCheckAndAutoResolveCoryBrainInitiativeTickets();

    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
    expect(report.breakdown.initiative_not_found).toEqual({ checked: 1, closed: 0 });
  });

  it('breakdown is grouped by outcome across a mixed batch', async () => {
    mockTicketFindAll.mockResolvedValue([
      parentTicket({ id: 'p-cancel' }),
      parentTicket({ id: 'p-complete' }),
      parentTicket({ id: 'p-active' }),
      parentTicket({ id: 'p-orphan' }),
    ]);
    mockInitiativeFindAll.mockResolvedValue([
      initiativeRow({ id: 'i1', ticket_id: 'p-cancel', status: 'cancelled' }),
      initiativeRow({ id: 'i2', ticket_id: 'p-complete', status: 'completed' }),
      initiativeRow({ id: 'i3', ticket_id: 'p-active', status: 'in_progress' }),
    ]);

    const report = await reCheckAndAutoResolveCoryBrainInitiativeTickets();

    expect(report.breakdown.initiative_cancelled).toEqual({ checked: 1, closed: 1 });
    expect(report.breakdown.initiative_completed).toEqual({ checked: 1, closed: 1 });
    expect(report.breakdown.initiative_still_active).toEqual({ checked: 1, closed: 0 });
    expect(report.breakdown.initiative_not_found).toEqual({ checked: 1, closed: 0 });
    expect(report.closed).toBe(2);
    expect(report.checked).toBe(4);
  });

  it('idempotency: running twice in a row where the first run already closed everything results in zero writes on the second run', async () => {
    mockTicketFindAll.mockResolvedValueOnce([parentTicket({ id: 'p1' })]).mockResolvedValueOnce([]); // 2nd fetch: query's own status filter already excludes it once closed
    mockInitiativeFindAll.mockResolvedValue([initiativeRow({ id: 'i1', ticket_id: 'p1', status: 'cancelled' })]);

    const firstRun = await reCheckAndAutoResolveCoryBrainInitiativeTickets();
    const secondRun = await reCheckAndAutoResolveCoryBrainInitiativeTickets();

    expect(firstRun.closed).toBe(1);
    expect(secondRun.closed).toBe(0);
    expect(secondRun.checked).toBe(0);
    expect(mockUpdateTicketStatus).toHaveBeenCalledTimes(1);
  });

  it('one write failure does not abort processing of the rest of the batch', async () => {
    mockTicketFindAll.mockResolvedValue([
      parentTicket({ id: 'will-throw' }),
      parentTicket({ id: 'will-succeed' }),
    ]);
    mockInitiativeFindAll.mockResolvedValue([
      initiativeRow({ id: 'i1', ticket_id: 'will-throw', status: 'cancelled' }),
      initiativeRow({ id: 'i2', ticket_id: 'will-succeed', status: 'completed' }),
    ]);
    mockUpdateTicketStatus.mockRejectedValueOnce(new Error('DB write failed')).mockResolvedValueOnce({});

    const report = await reCheckAndAutoResolveCoryBrainInitiativeTickets();

    expect(report.results.find((r) => r.ticket_id === 'will-throw')?.write_error).toBe('DB write failed');
    expect(report.results.find((r) => r.ticket_id === 'will-succeed')?.write_error).toBeUndefined();
    expect(report.closed).toBe(1);
  });
});
