/**
 * orgChartTaskAssignmentService — CLAUDE.md's mandatory 4 test types for
 * this feature (happy/failure/boundary/idempotency), non-negotiable per
 * this run's execution-contract.md.
 */
jest.mock('../../../models', () => ({ Ticket: { findOne: jest.fn() } }));
jest.mock('../../ticketService', () => ({ createTicket: jest.fn() }));
jest.mock('../orgChartHierarchyService', () => ({ isAgentInHumanDownstream: jest.fn() }));

import { Ticket } from '../../../models';
import { createTicket } from '../../ticketService';
import { isAgentInHumanDownstream } from '../orgChartHierarchyService';
import { assignTaskToAgent, AgentNotInHierarchyError } from '../orgChartTaskAssignmentService';

const mockTicketFindOne = Ticket.findOne as unknown as jest.Mock;
const mockCreateTicket = createTicket as unknown as jest.Mock;
const mockIsInDownstream = isAgentInHumanDownstream as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('assignTaskToAgent — happy path', () => {
  it('a valid downstream agent creates a ticket with the correct fields', async () => {
    mockIsInDownstream.mockResolvedValue(true);
    mockTicketFindOne.mockResolvedValue(null);
    mockCreateTicket.mockResolvedValue({ id: 'ticket-1', title: 'Investigate lead spike' });

    const result = await assignTaskToAgent({
      orgMemberId: 'human-1', agentId: 'agent-1', title: 'Investigate lead spike',
      description: 'See dashboard', idempotencyKey: 'key-1',
    });

    expect(mockIsInDownstream).toHaveBeenCalledWith('human-1', 'agent-1');
    expect(mockCreateTicket).toHaveBeenCalledTimes(1);
    expect(mockCreateTicket).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Investigate lead spike',
      description: 'See dashboard',
      type: 'agent_action',
      created_by_type: 'org_member',
      created_by_id: 'human-1',
      assigned_to_type: 'agent',
      assigned_to_id: 'agent-1',
      metadata: expect.objectContaining({ idempotency_key: 'key-1' }),
    }));
    expect(result).toEqual({ id: 'ticket-1', title: 'Investigate lead spike' });
  });
});

describe('assignTaskToAgent — failure path (the real authorization boundary)', () => {
  it('CROSS-HIERARCHY: an agent id NOT in the human\'s downstream hierarchy is rejected BEFORE any DB touch', async () => {
    mockIsInDownstream.mockResolvedValue(false);

    await expect(
      assignTaskToAgent({ orgMemberId: 'human-1', agentId: 'someone-elses-agent', title: 'Sneaky task', idempotencyKey: 'key-2' }),
    ).rejects.toBeInstanceOf(AgentNotInHierarchyError);

    await expect(
      assignTaskToAgent({ orgMemberId: 'human-1', agentId: 'someone-elses-agent', title: 'Sneaky task', idempotencyKey: 'key-2' }),
    ).rejects.toMatchObject({ status: 403 });

    expect(mockTicketFindOne).not.toHaveBeenCalled();
    expect(mockCreateTicket).not.toHaveBeenCalled();
  });
});

describe('assignTaskToAgent — boundary', () => {
  it('empty/whitespace-only title is rejected, no ticket created, hierarchy is not even checked first (fails fast on cheap validation)', async () => {
    await expect(
      assignTaskToAgent({ orgMemberId: 'human-1', agentId: 'agent-1', title: '   ', idempotencyKey: 'key-3' }),
    ).rejects.toThrow(/title is required/);

    expect(mockCreateTicket).not.toHaveBeenCalled();
  });
});

describe('assignTaskToAgent — idempotency (CLAUDE.md non-negotiable)', () => {
  it('the SAME idempotencyKey submitted twice creates exactly ONE ticket total; both calls resolve to the same ticket', async () => {
    mockIsInDownstream.mockResolvedValue(true);
    const CREATED_TICKET = { id: 'ticket-dup-safe', title: 'Assign this once' };

    // First call: no existing ticket found -> creates one.
    mockTicketFindOne.mockResolvedValueOnce(null);
    mockCreateTicket.mockResolvedValueOnce(CREATED_TICKET);

    const first = await assignTaskToAgent({
      orgMemberId: 'human-1', agentId: 'agent-1', title: 'Assign this once', idempotencyKey: 'stable-key',
    });

    // Second call, SAME idempotencyKey: findOne now returns the ticket the first call created.
    mockTicketFindOne.mockResolvedValueOnce(CREATED_TICKET);

    const second = await assignTaskToAgent({
      orgMemberId: 'human-1', agentId: 'agent-1', title: 'Assign this once', idempotencyKey: 'stable-key',
    });

    expect(first.id).toBe('ticket-dup-safe');
    expect(second.id).toBe('ticket-dup-safe');
    expect(mockCreateTicket).toHaveBeenCalledTimes(1); // never called a 2nd time
  });

  it('the idempotency lookup is scoped to this creator + this exact key (JSONB containment on metadata)', async () => {
    mockIsInDownstream.mockResolvedValue(true);
    mockTicketFindOne.mockResolvedValue(null);
    mockCreateTicket.mockResolvedValue({ id: 'ticket-x' });

    await assignTaskToAgent({ orgMemberId: 'human-1', agentId: 'agent-1', title: 'Task', idempotencyKey: 'key-scoped' });

    expect(mockTicketFindOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        created_by_type: 'org_member',
        created_by_id: 'human-1',
      }),
    }));
  });
});
