/**
 * bpos_orchestrator Capability Ticket Auto-Resolver — unit tests.
 *
 * Mirrors the mocking shape workforceTicketAutoResolver.test.ts already uses for this
 * same "company" folder (mock '../../models' and the dynamically-imported sibling
 * module), since bposCapabilityTicketAutoResolver.ts uses the exact same
 * dynamic-import convention.
 */
import { Op } from 'sequelize';

const mockTicketFindAll = jest.fn();
const mockCapabilityFindAll = jest.fn();
const mockUpdateTicketStatus = jest.fn();

jest.mock('../../../models', () => ({
  Ticket: { findAll: (...args: any[]) => mockTicketFindAll(...args) },
  Capability: { findAll: (...args: any[]) => mockCapabilityFindAll(...args) },
}));
jest.mock('../ticketOrchestrator', () => ({
  updateTicketStatus: (...args: any[]) => mockUpdateTicketStatus(...args),
}));

import {
  fetchLiveResolvableBposCapabilityTickets,
  resolveBposCapabilityTickets,
} from '../bposCapabilityTicketAutoResolver';

function makeTicket(overrides: Partial<any> = {}) {
  return {
    id: 'ticket-1',
    entity_id: 'cap-1',
    status: 'in_progress',
    ...overrides,
  };
}

function makeCapability(overrides: Partial<any> = {}) {
  return {
    id: 'cap-1',
    name: 'Some Capability',
    user_status: 'in_progress',
    user_status_set_by: 'admin-user-abc123',
    user_status_set_at: '2026-04-28T18:52:46.656Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTicketFindAll.mockResolvedValue([]);
  mockCapabilityFindAll.mockResolvedValue([]);
  mockUpdateTicketStatus.mockResolvedValue({});
});

describe('fetchLiveResolvableBposCapabilityTickets — query scope', () => {
  it('queries only open (non-terminal) bpos_execution tickets created by bpos_orchestrator, entity_type capability', async () => {
    await fetchLiveResolvableBposCapabilityTickets();

    const whereArg = mockTicketFindAll.mock.calls[0][0].where;
    expect(whereArg.created_by_id).toBe('bpos_orchestrator');
    expect(whereArg.type).toBe('bpos_execution');
    expect(whereArg.entity_type).toBe('capability');
    expect(whereArg.status[Op.notIn]).toEqual(['done', 'cancelled']);
  });

  it('batch-loads capabilities in ONE query for all distinct entity_ids, not one query per ticket', async () => {
    mockTicketFindAll.mockResolvedValue([
      makeTicket({ id: 'ticket-a', entity_id: 'cap-1' }),
      makeTicket({ id: 'ticket-b', entity_id: 'cap-2' }),
      makeTicket({ id: 'ticket-c', entity_id: 'cap-1' }), // duplicate entity_id, real prod shape
    ]);
    mockCapabilityFindAll.mockResolvedValue([makeCapability({ id: 'cap-1' }), makeCapability({ id: 'cap-2' })]);

    await fetchLiveResolvableBposCapabilityTickets();

    expect(mockCapabilityFindAll).toHaveBeenCalledTimes(1);
    expect(mockCapabilityFindAll.mock.calls[0][0].where.id[Op.in].sort()).toEqual(['cap-1', 'cap-2']);
  });
});

describe('fetchLiveResolvableBposCapabilityTickets — classification wiring', () => {
  it('a verified capability classifies capability_verified / should_close true / done, evidence cites real name + verified-by/at', async () => {
    mockTicketFindAll.mockResolvedValue([makeTicket({ id: 'ticket-verified', entity_id: 'cap-1' })]);
    mockCapabilityFindAll.mockResolvedValue([
      makeCapability({
        id: 'cap-1',
        name: 'Agents Page',
        user_status: 'verified',
        user_status_set_by: 'caf95c1e-f5ac-41b8-a253-097720d77f06',
        user_status_set_at: '2026-04-28T18:52:46.656Z',
      }),
    ]);

    const results = await fetchLiveResolvableBposCapabilityTickets();

    expect(results[0].outcome).toBe('capability_verified');
    expect(results[0].should_close).toBe(true);
    expect(results[0].close_to_status).toBe('done');
    expect(results[0].capability_name).toBe('Agents Page');
    // Evidence note must cite the REAL capability name and WHO/WHEN verified it, not
    // just the id — this is the provenance the whole run's justification rests on.
    expect(results[0].evidence_note).toContain('Agents Page');
    expect(results[0].evidence_note).toContain('caf95c1e-f5ac-41b8-a253-097720d77f06');
    expect(results[0].evidence_note).toContain('2026-04-28T18:52:46.656Z');
  });

  it('a capability with no matching row classifies capability_deleted / should_close true / cancelled', async () => {
    mockTicketFindAll.mockResolvedValue([makeTicket({ id: 'ticket-deleted', entity_id: 'cap-gone' })]);
    mockCapabilityFindAll.mockResolvedValue([]); // no row returned for cap-gone

    const results = await fetchLiveResolvableBposCapabilityTickets();

    expect(results[0].outcome).toBe('capability_deleted');
    expect(results[0].should_close).toBe(true);
    expect(results[0].close_to_status).toBe('cancelled');
    expect(results[0].capability_name).toBeNull();
  });

  it('an in_progress capability classifies no_signal / should_close false', async () => {
    mockTicketFindAll.mockResolvedValue([makeTicket({ id: 'ticket-stall', entity_id: 'cap-1' })]);
    mockCapabilityFindAll.mockResolvedValue([makeCapability({ id: 'cap-1', user_status: 'in_progress' })]);

    const results = await fetchLiveResolvableBposCapabilityTickets();

    expect(results[0].outcome).toBe('no_signal');
    expect(results[0].should_close).toBe(false);
  });
});

describe('resolveBposCapabilityTickets — closes on real signal', () => {
  it('closes a verified-capability ticket to done with actor cory/bpos_orchestrator and an evidence comment citing real name + verified-by/at', async () => {
    mockTicketFindAll.mockResolvedValue([makeTicket({ id: 'ticket-verified', entity_id: 'cap-1' })]);
    mockCapabilityFindAll.mockResolvedValue([
      makeCapability({
        id: 'cap-1',
        name: 'Milestones Management',
        user_status: 'verified',
        user_status_set_by: '654864ea-35dd-4220-8631-26d22519aa04',
        user_status_set_at: '2026-04-30T19:09:17.463Z',
      }),
    ]);

    const report = await resolveBposCapabilityTickets();

    expect(mockUpdateTicketStatus).toHaveBeenCalledTimes(1);
    const [ticketId, newStatus, actorType, actorId, comment] = mockUpdateTicketStatus.mock.calls[0];
    expect(ticketId).toBe('ticket-verified');
    expect(newStatus).toBe('done');
    expect(actorType).toBe('cory');
    expect(actorId).toBe('bpos_orchestrator');
    expect(comment).toContain('Milestones Management');
    expect(comment).toContain('654864ea-35dd-4220-8631-26d22519aa04');
    expect(comment).toContain('2026-04-30T19:09:17.463Z');
    expect(report.closed).toBe(1);
    expect(report.breakdown.capability_verified.closed).toBe(1);
  });

  it('closes a deleted-capability ticket to cancelled', async () => {
    mockTicketFindAll.mockResolvedValue([makeTicket({ id: 'ticket-deleted', entity_id: 'cap-gone' })]);
    mockCapabilityFindAll.mockResolvedValue([]);

    const report = await resolveBposCapabilityTickets();

    expect(mockUpdateTicketStatus).toHaveBeenCalledTimes(1);
    const [, newStatus] = mockUpdateTicketStatus.mock.calls[0];
    expect(newStatus).toBe('cancelled');
    expect(report.breakdown.capability_deleted.closed).toBe(1);
  });
});

describe('resolveBposCapabilityTickets — no signal, no writes', () => {
  it('an in_progress capability produces zero writes', async () => {
    mockTicketFindAll.mockResolvedValue([makeTicket({ id: 'ticket-stall', entity_id: 'cap-1' })]);
    mockCapabilityFindAll.mockResolvedValue([makeCapability({ id: 'cap-1', user_status: 'in_progress' })]);

    const report = await resolveBposCapabilityTickets();

    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
    expect(report.closed).toBe(0);
    expect(report.results[0].outcome).toBe('no_signal');
  });

  it('idempotency: running twice against the same still-in_progress data produces zero writes both times', async () => {
    mockTicketFindAll.mockResolvedValue([makeTicket({ id: 'ticket-stall', entity_id: 'cap-1' })]);
    mockCapabilityFindAll.mockResolvedValue([makeCapability({ id: 'cap-1', user_status: 'in_progress' })]);

    await resolveBposCapabilityTickets();
    await resolveBposCapabilityTickets();

    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
  });
});

describe('resolveBposCapabilityTickets — one bad ticket does not abort the batch', () => {
  it('one ticket erroring on updateTicketStatus still lets the others process', async () => {
    mockTicketFindAll.mockResolvedValue([
      makeTicket({ id: 'ticket-fail', entity_id: 'cap-1' }),
      makeTicket({ id: 'ticket-ok', entity_id: 'cap-2' }),
    ]);
    mockCapabilityFindAll.mockResolvedValue([
      makeCapability({ id: 'cap-1', user_status: 'verified' }),
      makeCapability({ id: 'cap-2', user_status: 'verified' }),
    ]);
    mockUpdateTicketStatus.mockRejectedValueOnce(new Error('DB write failed')).mockResolvedValueOnce({});

    const report = await resolveBposCapabilityTickets();

    expect(report.results.find((r) => r.ticket_id === 'ticket-fail')?.write_error).toContain('DB write failed');
    expect(report.results.find((r) => r.ticket_id === 'ticket-ok')?.write_error).toBeUndefined();
    expect(report.closed).toBe(1);
  });
});

describe('resolveBposCapabilityTickets — missing entity_id defense-in-depth', () => {
  it('a ticket with no entity_id is left untouched, never crashes', async () => {
    mockTicketFindAll.mockResolvedValue([makeTicket({ id: 'ticket-no-entity', entity_id: null })]);

    const report = await resolveBposCapabilityTickets();

    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
    expect(report.results[0].outcome).toBe('no_signal');
  });
});
