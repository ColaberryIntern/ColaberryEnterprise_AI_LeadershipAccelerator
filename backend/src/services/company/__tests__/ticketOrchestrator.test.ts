/**
 * Agent Alias & Identity Fix — forward-fix for workforce_intelligence_engine's
 * and bpos_orchestrator's ticket-creator identity. Both go through
 * createTrackedTicket(), which always creates with status:'backlog' — never
 * intersects ticketManagementAgent.ts's status:'todo' auto-dispatch sweep — so
 * both are safe to fully forward-stamp with the real AdminUser id as assignee.
 *
 * Agent Quality Cleanup, Item 2 — workforce_intelligence_engine's ticket
 * dedup. createWorkforceTicket() now checks for an existing OPEN ticket
 * (entity_type:'agent', entity_id:'<agentName>:high_error_rate', no
 * time window) before calling createTrackedTicket() — the same
 * "reuse-while-open" shape ticketService.ts's createTicket() already proves,
 * applied locally here since createTrackedTicket() itself (shared with
 * createBPOSTicket()/createDirectiveTicket()) is deliberately left untouched.
 */
const mockTicketCreate = jest.fn();
const mockTicketFindOne = jest.fn();
const mockActivityCreate = jest.fn();
jest.mock('../../../models', () => ({
  Ticket: {
    create: (...args: any[]) => mockTicketCreate(...args),
    findOne: (...args: any[]) => mockTicketFindOne(...args),
  },
  TicketActivity: { create: (...args: any[]) => mockActivityCreate(...args) },
}));
jest.mock('../../agentBlueprint/ticketCreatorIdentitySeed', () => ({
  getTicketCreatorAdminUserId: jest.fn(),
}));

import { getTicketCreatorAdminUserId } from '../../agentBlueprint/ticketCreatorIdentitySeed';
import { createWorkforceTicket, createBPOSTicket } from '../ticketOrchestrator';

const mockGetAdminUserId = getTicketCreatorAdminUserId as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockTicketFindOne.mockResolvedValue(null); // default: no open ticket found
  mockTicketCreate.mockResolvedValue({ id: 'ticket-1', ticket_number: 1 });
  mockActivityCreate.mockResolvedValue({});
});

describe('createWorkforceTicket — forward-fix stamps workforce_intelligence_engine\'s real identity', () => {
  it('happy path: stamps the real AdminUser id as assignee, without touching createdByType/createdById', async () => {
    mockGetAdminUserId.mockResolvedValue('admin-workforce-1');

    await createWorkforceTicket('company-1', 'SomeAgent', 'decision', 'reasoning');

    expect(mockGetAdminUserId).toHaveBeenCalledWith('workforce_intelligence_engine');
    const ticketArgs = mockTicketCreate.mock.calls[0][0];
    expect(ticketArgs.assigned_to_type).toBe('ai_staff');
    expect(ticketArgs.assigned_to_id).toBe('admin-workforce-1');
    expect(ticketArgs.created_by_type).toBe('agent');
    expect(ticketArgs.created_by_id).toBe('workforce_intelligence_engine');
    expect(ticketArgs.status).toBe('backlog');
  });

  it('failure path: identity not yet resolvable (null) never writes a literal null/undefined assignee id', async () => {
    mockGetAdminUserId.mockResolvedValue(null);

    await createWorkforceTicket('company-1', 'SomeAgent', 'decision', 'reasoning');

    const ticketArgs = mockTicketCreate.mock.calls[0][0];
    expect(ticketArgs.assigned_to_type).toBeNull();
    expect(ticketArgs.assigned_to_id).toBeNull();
  });
});

describe('createWorkforceTicket — dedup (stops the hourly-refile bug)', () => {
  it('an open, unresolved finding does NOT spawn a second ticket — reuses the existing open ticket and skips Ticket.create entirely', async () => {
    const existingOpenTicket = { id: 'ticket-existing', status: 'todo' };
    mockTicketFindOne.mockResolvedValue(existingOpenTicket);

    const result = await createWorkforceTicket(
      'company-1',
      'OpenclawLearningOptimizationAgent',
      'High error rate detected: 84%',
      'reasoning',
    );

    expect(result).toBe(existingOpenTicket);
    expect(mockTicketCreate).not.toHaveBeenCalled();
    const findArgs = mockTicketFindOne.mock.calls[0][0];
    expect(findArgs.where.entity_type).toBe('agent');
    expect(findArgs.where.entity_id).toBe('OpenclawLearningOptimizationAgent:high_error_rate');
    expect(findArgs.where.type).toBe('workforce_decision');
  });

  it('no open ticket exists yet -> creates a new one, keyed on the same entity_id the dedup check queries for', async () => {
    mockTicketFindOne.mockResolvedValue(null);
    mockTicketCreate.mockResolvedValue({ id: 'ticket-new' });

    await createWorkforceTicket('company-1', 'OpenclawLearningOptimizationAgent', 'High error rate detected: 84%', 'reasoning');

    expect(mockTicketCreate).toHaveBeenCalledTimes(1);
    const createArgs = mockTicketCreate.mock.calls[0][0];
    expect(createArgs.entity_type).toBe('agent');
    expect(createArgs.entity_id).toBe('OpenclawLearningOptimizationAgent:high_error_rate');
    // The write and the dedup check must use the IDENTICAL key, or the check
    // could never match a ticket this function itself created.
    expect(createArgs.entity_id).toBe(mockTicketFindOne.mock.calls[0][0].where.entity_id);
  });

  it('a resolved finding (prior ticket done) and a genuine recurrence -> opens a FRESH ticket, not suppressed forever', async () => {
    // findOne's own query filters status NOT IN (done, cancelled) — a done
    // ticket is invisible to it, so the mock reflects what the real query
    // would return: nothing open.
    mockTicketFindOne.mockResolvedValue(null);
    mockTicketCreate.mockResolvedValue({ id: 'ticket-fresh-recurrence' });

    const result = await createWorkforceTicket('company-1', 'OpenclawLearningOptimizationAgent', 'High error rate detected: 84%', 'reasoning');

    expect(result).toEqual({ id: 'ticket-fresh-recurrence' });
    expect(mockTicketCreate).toHaveBeenCalledTimes(1);
  });

  it('a genuinely different agent is not suppressed by an unrelated agent\'s open ticket', async () => {
    mockTicketFindOne.mockImplementation(async ({ where }: any) =>
      where.entity_id === 'AgentA:high_error_rate' ? { id: 'ticket-a' } : null,
    );
    mockTicketCreate.mockResolvedValue({ id: 'ticket-b' });

    const result = await createWorkforceTicket('company-1', 'AgentB', 'High error rate detected: 30%', 'reasoning');

    expect(result).toEqual({ id: 'ticket-b' });
    expect(mockTicketCreate).toHaveBeenCalledTimes(1);
  });
});

describe('createBPOSTicket / createTrackedTicket — untouched by the workforce dedup fix (non-goal boundary)', () => {
  it('createBPOSTicket never queries Ticket.findOne — no dedup check was added to the shared primitive', async () => {
    mockGetAdminUserId.mockResolvedValue('admin-bpos-1');

    await createBPOSTicket('company-1', 'Onboarding', 'Build', 'bp-1');

    expect(mockTicketFindOne).not.toHaveBeenCalled();
    expect(mockTicketCreate).toHaveBeenCalledTimes(1);
  });

  it('createBPOSTicket still creates unconditionally even when a workforce ticket for a similarly-named entity is "open" — proves the two paths are fully independent', async () => {
    mockTicketFindOne.mockResolvedValue({ id: 'unrelated-workforce-ticket' }); // would matter if BPOS shared the check; it doesn't
    mockGetAdminUserId.mockResolvedValue('admin-bpos-1');

    await createBPOSTicket('company-1', 'Onboarding', 'Build', 'bp-1');

    expect(mockTicketCreate).toHaveBeenCalledTimes(1);
  });
});

describe('createBPOSTicket — forward-fix stamps bpos_orchestrator\'s real identity', () => {
  it('happy path: stamps the real AdminUser id as assignee, without touching createdByType/createdById', async () => {
    mockGetAdminUserId.mockResolvedValue('admin-bpos-1');

    await createBPOSTicket('company-1', 'Onboarding', 'Build', 'bp-1');

    expect(mockGetAdminUserId).toHaveBeenCalledWith('bpos_orchestrator');
    const ticketArgs = mockTicketCreate.mock.calls[0][0];
    expect(ticketArgs.assigned_to_type).toBe('ai_staff');
    expect(ticketArgs.assigned_to_id).toBe('admin-bpos-1');
    expect(ticketArgs.created_by_type).toBe('cory');
    expect(ticketArgs.created_by_id).toBe('bpos_orchestrator');
    expect(ticketArgs.status).toBe('backlog');
  });

  it('failure path: identity not yet resolvable (null) never writes a literal null/undefined assignee id', async () => {
    mockGetAdminUserId.mockResolvedValue(null);

    await createBPOSTicket('company-1', 'Onboarding', 'Build', 'bp-1');

    const ticketArgs = mockTicketCreate.mock.calls[0][0];
    expect(ticketArgs.assigned_to_type).toBeNull();
    expect(ticketArgs.assigned_to_id).toBeNull();
  });
});
