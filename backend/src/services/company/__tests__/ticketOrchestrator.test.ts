/**
 * Agent Alias & Identity Fix — forward-fix for workforce_intelligence_engine's
 * and bpos_orchestrator's ticket-creator identity. Both go through
 * createTrackedTicket(), which always creates with status:'backlog' — never
 * intersects ticketManagementAgent.ts's status:'todo' auto-dispatch sweep — so
 * both are safe to fully forward-stamp with the real AdminUser id as assignee.
 */
const mockTicketCreate = jest.fn();
const mockActivityCreate = jest.fn();
jest.mock('../../../models', () => ({
  Ticket: { create: (...args: any[]) => mockTicketCreate(...args) },
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
