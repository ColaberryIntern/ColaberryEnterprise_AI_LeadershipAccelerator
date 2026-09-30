/**
 * Workforce Ticket Auto-Resolver — unit tests.
 *
 * Mirrors the mocking shape ticketOrchestrator.test.ts already uses for this same
 * "company" folder (mock '../../models' and the dynamically-imported sibling module),
 * since workforceTicketAutoResolver.ts uses the exact same dynamic-import convention.
 */
import { Op } from 'sequelize';

const mockTicketFindAll = jest.fn();
const mockAiAgentFindAll = jest.fn();
const mockUpdateTicketStatus = jest.fn();

jest.mock('../../../models', () => ({
  Ticket: { findAll: (...args: any[]) => mockTicketFindAll(...args) },
  AiAgent: { findAll: (...args: any[]) => mockAiAgentFindAll(...args) },
}));
jest.mock('../ticketOrchestrator', () => ({
  updateTicketStatus: (...args: any[]) => mockUpdateTicketStatus(...args),
}));

import {
  reCheckAndAutoResolveWorkforceTickets,
  WORKFORCE_HIGH_ERROR_RATE_THRESHOLD_PCT,
  WORKFORCE_HIGH_ERROR_RATE_MIN_COUNT,
} from '../workforceTicketAutoResolver';

function makeTicket(overrides: Partial<any> = {}) {
  return {
    id: 'ticket-1',
    ticket_number: 101,
    entity_id: 'SomeAgent:high_error_rate',
    metadata: { agent_name: 'SomeAgent', decision: 'High error rate detected: 50%', reasoning: 'Review SomeAgent' },
    status: 'backlog',
    ...overrides,
  };
}

function makeAgent(overrides: Partial<any> = {}) {
  return { agent_name: 'SomeAgent', run_count: 100, error_count: 50, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTicketFindAll.mockResolvedValue([]);
  mockAiAgentFindAll.mockResolvedValue([]);
  mockUpdateTicketStatus.mockResolvedValue({});
});

describe('reCheckAndAutoResolveWorkforceTickets — query scope', () => {
  it('queries only open (non-terminal) workforce_decision tickets created by workforce_intelligence_engine — this is what makes an already-closed ticket a safe no-op by construction', async () => {
    await reCheckAndAutoResolveWorkforceTickets();

    const whereArg = mockTicketFindAll.mock.calls[0][0].where;
    expect(whereArg.type).toBe('workforce_decision');
    expect(whereArg.entity_type).toBe('agent');
    expect(whereArg.created_by_id).toBe('workforce_intelligence_engine');
    expect(whereArg.status[Op.notIn]).toEqual(['done', 'cancelled']);
  });
});

describe('reCheckAndAutoResolveWorkforceTickets — condition still true', () => {
  it('an agent still above threshold (>20% AND >=10 errors) stays open: no status change, no comment, marked still_open', async () => {
    mockTicketFindAll.mockResolvedValue([makeTicket()]);
    mockAiAgentFindAll.mockResolvedValue([makeAgent({ run_count: 100, error_count: 50 })]); // 50% > 20%, 50 >= 10

    const report = await reCheckAndAutoResolveWorkforceTickets();

    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
    expect(report.closed).toBe(0);
    expect(report.results[0].outcome).toBe('still_open');
  });

  it('idempotency: running twice against the same still-high stats produces zero writes in either run', async () => {
    mockTicketFindAll.mockResolvedValue([makeTicket()]);
    mockAiAgentFindAll.mockResolvedValue([makeAgent({ run_count: 100, error_count: 50 })]);

    await reCheckAndAutoResolveWorkforceTickets();
    await reCheckAndAutoResolveWorkforceTickets();

    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
  });
});

describe('reCheckAndAutoResolveWorkforceTickets — condition genuinely cleared', () => {
  it('closes the ticket exactly once with a real evidence comment containing the actual current numbers, not a generic message', async () => {
    mockTicketFindAll.mockResolvedValue([makeTicket()]);
    mockAiAgentFindAll.mockResolvedValue([makeAgent({ run_count: 200, error_count: 10 })]); // 5% <= 20%

    const report = await reCheckAndAutoResolveWorkforceTickets();

    expect(mockUpdateTicketStatus).toHaveBeenCalledTimes(1);
    const [ticketId, newStatus, actorType, actorId, comment] = mockUpdateTicketStatus.mock.calls[0];
    expect(ticketId).toBe('ticket-1');
    expect(newStatus).toBe('done');
    expect(actorType).toBe('agent');
    expect(actorId).toBe('workforce_intelligence_engine');
    expect(comment).toContain('SomeAgent');
    expect(comment).toContain('10/200'); // real current error_count/run_count
    expect(comment).toContain('5%'); // real current rate
    expect(comment.toLowerCase()).toContain('not a verified root-cause fix'); // honesty boundary
    expect(report.closed).toBe(1);
    expect(report.results[0].outcome).toBe('closed');
  });

  it('multiple open tickets for the same agent (real prod shape) each close independently, no cross-ticket skipping or duplication', async () => {
    mockTicketFindAll.mockResolvedValue([
      makeTicket({ id: 'ticket-a', ticket_number: 1 }),
      makeTicket({ id: 'ticket-b', ticket_number: 2, entity_id: 'SomeAgent' }), // legacy bare entity_id shape
      makeTicket({ id: 'ticket-c', ticket_number: 3 }),
    ]);
    mockAiAgentFindAll.mockResolvedValue([makeAgent({ run_count: 500, error_count: 5 })]); // 1% <= 20%

    const report = await reCheckAndAutoResolveWorkforceTickets();

    expect(mockUpdateTicketStatus).toHaveBeenCalledTimes(3);
    expect(report.closed).toBe(3);
    expect(report.checked).toBe(3);
    // Only one AiAgent lookup batch for the shared agent name, not one query per ticket.
    expect(mockAiAgentFindAll).toHaveBeenCalledTimes(1);
    expect(mockAiAgentFindAll.mock.calls[0][0].where.agent_name[Op.in]).toEqual(['SomeAgent']);
  });
});

describe('reCheckAndAutoResolveWorkforceTickets — target agent no longer exists', () => {
  it('handled gracefully: no throw, no write, ticket marked skipped_agent_not_found', async () => {
    mockTicketFindAll.mockResolvedValue([makeTicket({ metadata: { agent_name: 'DeletedAgent' } })]);
    mockAiAgentFindAll.mockResolvedValue([]); // agent row no longer exists

    const report = await reCheckAndAutoResolveWorkforceTickets();

    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
    expect(report.results[0].outcome).toBe('skipped_agent_not_found');
    expect(report.closed).toBe(0);
  });
});

describe('reCheckAndAutoResolveWorkforceTickets — malformed ticket data', () => {
  it('a ticket with neither metadata.agent_name nor a usable entity_id is skipped, not crashed on', async () => {
    mockTicketFindAll.mockResolvedValue([makeTicket({ metadata: {}, entity_id: null })]);

    const report = await reCheckAndAutoResolveWorkforceTickets();

    expect(report.results[0].outcome).toBe('skipped_no_agent_name');
    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
  });
});

describe('reCheckAndAutoResolveWorkforceTickets — boundary: run_count = 0', () => {
  it('computes a 0% error rate (no divide-by-zero) and closes since 0% is at/below threshold', async () => {
    mockTicketFindAll.mockResolvedValue([makeTicket()]);
    mockAiAgentFindAll.mockResolvedValue([makeAgent({ run_count: 0, error_count: 0 })]);

    const report = await reCheckAndAutoResolveWorkforceTickets();

    expect(report.results[0].outcome).toBe('closed');
    expect(mockUpdateTicketStatus).toHaveBeenCalledTimes(1);
  });
});

describe('reCheckAndAutoResolveWorkforceTickets — a single bad ticket does not abort the batch', () => {
  it('one ticket erroring on updateTicketStatus still lets the others process', async () => {
    mockTicketFindAll.mockResolvedValue([
      makeTicket({ id: 'ticket-fail', metadata: { agent_name: 'AgentFail' } }),
      makeTicket({ id: 'ticket-ok', metadata: { agent_name: 'AgentOk' } }),
    ]);
    mockAiAgentFindAll.mockResolvedValue([
      makeAgent({ agent_name: 'AgentFail', run_count: 100, error_count: 1 }),
      makeAgent({ agent_name: 'AgentOk', run_count: 100, error_count: 1 }),
    ]);
    mockUpdateTicketStatus
      .mockRejectedValueOnce(new Error('DB write failed'))
      .mockResolvedValueOnce({});

    const report = await reCheckAndAutoResolveWorkforceTickets();

    expect(report.results.find((r) => r.ticket_id === 'ticket-fail')?.outcome).toBe('error');
    expect(report.results.find((r) => r.ticket_id === 'ticket-ok')?.outcome).toBe('closed');
    expect(report.closed).toBe(1);
  });
});

describe('threshold constants exported for the sync-guard test', () => {
  it('match the literal condition workforceIntelligenceEngine.ts creates tickets under', () => {
    expect(WORKFORCE_HIGH_ERROR_RATE_THRESHOLD_PCT).toBe(20);
    expect(WORKFORCE_HIGH_ERROR_RATE_MIN_COUNT).toBe(10);
  });
});
