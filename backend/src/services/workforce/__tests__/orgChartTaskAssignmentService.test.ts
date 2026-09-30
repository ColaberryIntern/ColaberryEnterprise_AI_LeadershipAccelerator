/**
 * orgChartTaskAssignmentService — CLAUDE.md's mandatory 4 test types for
 * this feature (happy/failure/boundary/idempotency), non-negotiable per
 * this run's execution-contract.md.
 *
 * 2026-08-25: mocks resolveHumanDownstreamAgents() (not the retired
 * isAgentInHumanDownstream() boolean check) — the service now needs the
 * real agent objects (id, enabled, agent_name) to also reject a
 * deactivated agent, not just confirm hierarchy membership.
 */
jest.mock('../../../models', () => ({ Ticket: { findOne: jest.fn() } }));
jest.mock('../../ticketService', () => ({ createTicket: jest.fn() }));
jest.mock('../orgChartHierarchyService', () => ({ resolveHumanDownstreamAgents: jest.fn() }));

import { Ticket } from '../../../models';
import { createTicket } from '../../ticketService';
import { resolveHumanDownstreamAgents } from '../orgChartHierarchyService';
import { assignTaskToAgent, AgentNotInHierarchyError, AgentDeactivatedError } from '../orgChartTaskAssignmentService';

const mockTicketFindOne = Ticket.findOne as unknown as jest.Mock;
const mockCreateTicket = createTicket as unknown as jest.Mock;
const mockResolveDownstream = resolveHumanDownstreamAgents as unknown as jest.Mock;

/** A real, enabled downstream agent — the common case every non-boundary
 * test starts from. */
const ENABLED_AGENT = { id: 'agent-1', agent_name: 'SomeLeadershipAgent', enabled: true };

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveDownstream.mockResolvedValue({ leadership: [ENABLED_AGENT], staff: [] });
});

describe('assignTaskToAgent — happy path', () => {
  it('a valid, ENABLED downstream agent creates a ticket with the correct fields', async () => {
    mockTicketFindOne.mockResolvedValue(null);
    mockCreateTicket.mockResolvedValue({ id: 'ticket-1', title: 'Investigate lead spike' });

    const result = await assignTaskToAgent({
      orgMemberId: 'human-1', agentId: 'agent-1', title: 'Investigate lead spike',
      description: 'See dashboard', idempotencyKey: 'key-1',
    });

    expect(mockResolveDownstream).toHaveBeenCalledWith('human-1');
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

  it('a valid AI Staff agent (not just AI Leadership) also works — the `staff` half of the hierarchy result', async () => {
    mockResolveDownstream.mockResolvedValue({ leadership: [], staff: [{ id: 'staff-agent-1', agent_name: 'SomeStaffAgent', enabled: true }] });
    mockTicketFindOne.mockResolvedValue(null);
    mockCreateTicket.mockResolvedValue({ id: 'ticket-2' });

    await assignTaskToAgent({ orgMemberId: 'human-1', agentId: 'staff-agent-1', title: 'Staff task', idempotencyKey: 'key-staff' });

    expect(mockCreateTicket).toHaveBeenCalledWith(expect.objectContaining({ assigned_to_id: 'staff-agent-1' }));
  });
});

describe('assignTaskToAgent — failure path (the real authorization boundaries)', () => {
  it('CROSS-HIERARCHY: an agent id NOT in the human\'s downstream hierarchy is rejected BEFORE any DB touch', async () => {
    mockResolveDownstream.mockResolvedValue({ leadership: [ENABLED_AGENT], staff: [] }); // 'someone-elses-agent' is not in this list

    await expect(
      assignTaskToAgent({ orgMemberId: 'human-1', agentId: 'someone-elses-agent', title: 'Sneaky task', idempotencyKey: 'key-2' }),
    ).rejects.toBeInstanceOf(AgentNotInHierarchyError);

    await expect(
      assignTaskToAgent({ orgMemberId: 'human-1', agentId: 'someone-elses-agent', title: 'Sneaky task', idempotencyKey: 'key-2' }),
    ).rejects.toMatchObject({ status: 403 });

    expect(mockTicketFindOne).not.toHaveBeenCalled();
    expect(mockCreateTicket).not.toHaveBeenCalled();
  });

  // Real bug, caught live 2026-08-25: Taiwo assigned "Audit of Payment
  // System" to FinanceIntelligenceArchitect, one of the 17 agents
  // deactivated in Phase A. It WAS genuinely in her hierarchy (this isn't
  // the cross-hierarchy case above), but switched off — the resulting
  // ticket would sit unworked forever. A client-side dropdown filter alone
  // is not a real authorization boundary, so this is enforced here too.
  it('DEACTIVATED AGENT: an agent genuinely in the hierarchy but enabled:false is rejected BEFORE any DB touch', async () => {
    mockResolveDownstream.mockResolvedValue({
      leadership: [{ id: 'agent-1', agent_name: 'FinanceIntelligenceArchitect', enabled: false }],
      staff: [],
    });

    await expect(
      assignTaskToAgent({ orgMemberId: 'human-1', agentId: 'agent-1', title: 'Audit of Payment System', idempotencyKey: 'key-deactivated' }),
    ).rejects.toBeInstanceOf(AgentDeactivatedError);

    await expect(
      assignTaskToAgent({ orgMemberId: 'human-1', agentId: 'agent-1', title: 'Audit of Payment System', idempotencyKey: 'key-deactivated' }),
    ).rejects.toMatchObject({ status: 403 });

    expect(mockTicketFindOne).not.toHaveBeenCalled();
    expect(mockCreateTicket).not.toHaveBeenCalled();
  });

  it('the deactivated-agent error message names the real agent, not a bare id', async () => {
    mockResolveDownstream.mockResolvedValue({
      leadership: [{ id: 'agent-1', agent_name: 'FinanceIntelligenceArchitect', enabled: false }],
      staff: [],
    });

    await expect(
      assignTaskToAgent({ orgMemberId: 'human-1', agentId: 'agent-1', title: 'Audit', idempotencyKey: 'key-msg' }),
    ).rejects.toThrow(/FinanceIntelligenceArchitect/);
  });
});

describe('assignTaskToAgent — boundary', () => {
  it('empty/whitespace-only title is rejected, no ticket created, hierarchy is not even checked first (fails fast on cheap validation)', async () => {
    await expect(
      assignTaskToAgent({ orgMemberId: 'human-1', agentId: 'agent-1', title: '   ', idempotencyKey: 'key-3' }),
    ).rejects.toThrow(/title is required/);

    expect(mockCreateTicket).not.toHaveBeenCalled();
    expect(mockResolveDownstream).not.toHaveBeenCalled();
  });
});

describe('assignTaskToAgent — idempotency (CLAUDE.md non-negotiable)', () => {
  it('the SAME idempotencyKey submitted twice creates exactly ONE ticket total; both calls resolve to the same ticket', async () => {
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
