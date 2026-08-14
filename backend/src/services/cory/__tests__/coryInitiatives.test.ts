/**
 * Agent Alias & Identity Fix — forward-fix for CoryBrain's ticket-creator
 * identity. createStrategicInitiative() creates its parent ticket via the
 * generic createTicket() (default status:'backlog', never enters
 * ticketManagementAgent.ts's status:'todo' auto-dispatch sweep), so it's safe
 * to fully forward-stamp the real AdminUser id as assignee, unlike cory-engine's
 * Review-branch exception.
 */
jest.mock('../../../models/StrategicInitiative', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), create: jest.fn() },
}));
jest.mock('../../ticketService', () => ({ createTicket: jest.fn(), createSubTasks: jest.fn() }));
jest.mock('../../agentBlueprint/ticketCreatorIdentitySeed', () => ({ getTicketCreatorAdminUserId: jest.fn() }));
jest.mock('../../aiEventService', () => ({ logAiEvent: jest.fn(() => Promise.resolve()) }));

import StrategicInitiative from '../../../models/StrategicInitiative';
import { createTicket } from '../../ticketService';
import { getTicketCreatorAdminUserId } from '../../agentBlueprint/ticketCreatorIdentitySeed';
import { createStrategicInitiative, type CreateInitiativeInput } from '../coryInitiatives';

const mockFindOne = StrategicInitiative.findOne as unknown as jest.Mock;
const mockCreate = StrategicInitiative.create as unknown as jest.Mock;
const mockCreateTicket = createTicket as unknown as jest.Mock;
const mockGetAdminUserId = getTicketCreatorAdminUserId as unknown as jest.Mock;

const INPUT: CreateInitiativeInput = {
  title: 'Improve onboarding flow',
  description: 'desc',
  initiative_type: 'process_improvement' as any,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFindOne.mockResolvedValue(null);
  mockCreateTicket.mockResolvedValue({ id: 'ticket-1' });
  mockCreate.mockResolvedValue({ id: 'initiative-1', ticket_id: 'ticket-1' });
});

describe('createStrategicInitiative — forward-fix stamps CoryBrain\'s real identity', () => {
  it('happy path: stamps the real AdminUser id as assignee, without touching created_by_type/created_by_id', async () => {
    mockGetAdminUserId.mockResolvedValue('admin-corybrain-1');

    await createStrategicInitiative(INPUT);

    expect(mockGetAdminUserId).toHaveBeenCalledWith('CoryBrain');
    const ticketArgs = mockCreateTicket.mock.calls[0][0];
    expect(ticketArgs.assigned_to_type).toBe('ai_staff');
    expect(ticketArgs.assigned_to_id).toBe('admin-corybrain-1');
    expect(ticketArgs.created_by_type).toBe('cory');
    expect(ticketArgs.created_by_id).toBe('CoryBrain');
  });

  it('failure path: identity not yet resolvable (null) never writes a literal null/undefined assignee id', async () => {
    mockGetAdminUserId.mockResolvedValue(null);

    await createStrategicInitiative(INPUT);

    const ticketArgs = mockCreateTicket.mock.calls[0][0];
    expect(ticketArgs).not.toHaveProperty('assigned_to_type');
    expect(ticketArgs).not.toHaveProperty('assigned_to_id');
  });

  it('idempotency: an existing active initiative with the same title short-circuits before any ticket is created', async () => {
    mockFindOne.mockResolvedValue({ id: 'existing-1' });

    const result = await createStrategicInitiative(INPUT);

    expect(result).toEqual({ id: 'existing-1' });
    expect(mockCreateTicket).not.toHaveBeenCalled();
    expect(mockGetAdminUserId).not.toHaveBeenCalled();
  });
});
