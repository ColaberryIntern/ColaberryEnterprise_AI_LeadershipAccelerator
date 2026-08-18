/**
 * Agent Detail service — the key boundary case per plan.md T011: given a
 * seeded Reese agent + 2 tickets (one belonging to Reese, one belonging to a
 * different assigned_to_id), the service returns exactly the 1 ticket that
 * belongs to Reese, proving the filter is correct.
 */
jest.mock('../../../models/AiAgent', () => ({ findByPk: jest.fn() }));
jest.mock('../../../models/AdminUser', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/Enrollment', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/CommunityMember', () => ({ findOne: jest.fn() }));
jest.mock('../../../models', () => ({ Ticket: { findAll: jest.fn() } }));
jest.mock('../../communityService', () => ({ derivePresence: jest.fn() }));

import { Op } from 'sequelize';
import AiAgent from '../../../models/AiAgent';
import AdminUser from '../../../models/AdminUser';
import Enrollment from '../../../models/Enrollment';
import CommunityMember from '../../../models/CommunityMember';
import { Ticket } from '../../../models';
import { derivePresence } from '../../communityService';
import { getAgentDetail } from '../agentDetailService';

const mockAgentFindByPk = AiAgent.findByPk as unknown as jest.Mock;
const mockAdminFindOne = AdminUser.findOne as unknown as jest.Mock;
const mockEnrollmentFindOne = Enrollment.findOne as unknown as jest.Mock;
const mockMemberFindOne = CommunityMember.findOne as unknown as jest.Mock;
const mockTicketFindAll = Ticket.findAll as unknown as jest.Mock;
const mockDerivePresence = derivePresence as unknown as jest.Mock;

const reeseAgent = {
  id: 'agent-1', agent_name: 'Reese', agent_type: 'ai_staff_mentor', category: 'student_success',
  description: 'desc', system_prompt: 'PROMPT', tools_granted: ['respond_to_dm'], persona_version: '2026-08-06',
  enabled: true, created_at: new Date('2026-08-01'),
};
const reeseAdmin = { id: 'admin-1', email: 'reese@colaberry.com', display_name: 'Reese', is_ai_operated: true };

beforeEach(() => {
  jest.clearAllMocks();
  mockAgentFindByPk.mockResolvedValue(reeseAgent);
  mockAdminFindOne.mockResolvedValue(reeseAdmin);
  mockEnrollmentFindOne.mockResolvedValue({ id: 'enrollment-1' });
  mockMemberFindOne.mockResolvedValue({ last_active_at: new Date() });
  mockDerivePresence.mockReturnValue('online');
  mockTicketFindAll.mockResolvedValue([]);
});

describe('getAgentDetail', () => {
  it('happy path: returns real identity, prompt, tools, live status, and tickets for a seeded agent', async () => {
    mockTicketFindAll.mockResolvedValue([
      { id: 't1', ticket_number: 1, title: 'Student support', status: 'todo', priority: 'medium', type: 'student_support', created_at: new Date(), updated_at: new Date() },
    ]);

    const result = await getAgentDetail('agent-1');

    expect(result).not.toBeNull();
    expect(result!.agent.agent_name).toBe('Reese');
    expect(result!.agent.system_prompt).toBe('PROMPT');
    expect(result!.agent.tools_granted).toEqual(['respond_to_dm']);
    expect(result!.identity).toMatchObject({ admin_user_id: 'admin-1', email: 'reese@colaberry.com', is_ai_operated: true });
    expect(result!.live_status).toBe('online');
    expect(result!.tickets).toHaveLength(1);
  });

  it('capabilities (reads/produces): derives from the agent\'s real tools_granted, not hand-written text', async () => {
    mockTicketFindAll.mockResolvedValue([]);

    const result = await getAgentDetail('agent-1');

    // reeseAgent's tools_granted is ['respond_to_dm'] — grounded in
    // agentToolCapabilities.ts's real dictionary entry.
    expect(result!.capabilities.produces).toContain('A reply message in the student DM thread');
    expect(result!.capabilities.undocumented_tools).toEqual([]);
  });

  it('capabilities honesty path: an agent with an undocumented tool discloses it, never fabricates reads/produces for it', async () => {
    mockAgentFindByPk.mockResolvedValue({ ...reeseAgent, tools_granted: ['a_tool_from_the_future'] });

    const result = await getAgentDetail('agent-1');

    expect(result!.capabilities.undocumented_tools).toEqual(['a_tool_from_the_future']);
  });

  it('capabilities.produced_ticket_types: reflects the real, live DISTINCT ticket types this agent has created — a second, unlimited grouped query, not the capped 50-row tickets list', async () => {
    // The capped tickets list only has 1 recent ticket, but the agent has
    // historically created 3 distinct types — produced_ticket_types must reflect
    // the full picture, proving it's a SEPARATE unlimited query, not derived from
    // the capped `tickets` array.
    mockTicketFindAll
      .mockResolvedValueOnce([{ id: 't-recent', ticket_number: 5, title: 'Recent', status: 'todo', priority: 'medium', type: 'student_support', created_at: new Date(), updated_at: new Date() }])
      .mockResolvedValueOnce([{ type: 'student_support' }, { type: 'reese_autonomous_outreach' }]);

    const result = await getAgentDetail('agent-1');

    expect(result!.tickets).toHaveLength(1);
    expect(result!.capabilities.produced_ticket_types.sort()).toEqual(['reese_autonomous_outreach', 'student_support']);
  });

  it('boundary (the core check): a Ticket.findAll filtered on the real match list returns ONLY the agent\'s own tickets, not every ticket in the system', async () => {
    // Simulate the real DB filter's effect: the mock only "returns" what a real
    // WHERE clause would — proving the SERVICE constructs that filter correctly,
    // which is what actually protects this.
    mockTicketFindAll.mockImplementation(async (query: any) => {
      const allTickets = [
        { id: 't-reese', assigned_to_type: 'ai_staff', assigned_to_id: 'admin-1', created_by_id: null, title: 'Reese ticket', status: 'todo', priority: 'medium', type: 'student_support', created_at: new Date(), updated_at: new Date() },
        { id: 't-other', assigned_to_type: 'ai_staff', assigned_to_id: 'some-other-agent-admin-id', created_by_id: null, title: 'Someone else\'s ticket', status: 'todo', priority: 'medium', type: 'student_support', created_at: new Date(), updated_at: new Date() },
      ];
      const matchIds: string[] = query.where[Op.or][0].assigned_to_id[Op.in];
      return allTickets.filter((t) => t.assigned_to_type === 'ai_staff' && matchIds.includes(t.assigned_to_id));
    });

    const result = await getAgentDetail('agent-1');

    expect(result!.tickets).toHaveLength(1);
    expect(result!.tickets[0].id).toBe('t-reese');
    const callArgs = mockTicketFindAll.mock.calls[0][0];
    const orClauses = callArgs.where[Op.or];
    expect(orClauses[0].assigned_to_id[Op.in]).toEqual(['admin-1']); // Reese has zero legacy aliases — match list is exactly her own id
    expect(orClauses[1].created_by_id[Op.in]).toEqual(['admin-1']);
  });

  it('alias-matching: an agent WITH legacy aliases sees its historical tickets (assigned_to_id null, created_by_id = raw legacy string) in its detail ticket list', async () => {
    const processAgent = { ...reeseAgent, id: 'agent-process-1', agent_name: 'cory-engine', config: { legacy_creator_ids: ['cory-engine'] } };
    const processAdmin = { ...reeseAdmin, id: 'admin-process-1' };
    mockAgentFindByPk.mockResolvedValue(processAgent);
    mockAdminFindOne.mockResolvedValue(processAdmin);
    mockTicketFindAll.mockImplementation(async (query: any) => {
      const allTickets = [
        { id: 't-legacy', assigned_to_type: null, assigned_to_id: null, created_by_id: 'cory-engine', title: 'Legacy autonomous decision', status: 'in_progress', priority: 'medium', type: 'agent_action', created_at: new Date(), updated_at: new Date() },
      ];
      const orClauses = query.where[Op.or];
      const assignedMatch = orClauses[0].assigned_to_id[Op.in];
      const createdMatch = orClauses[1].created_by_id[Op.in];
      return allTickets.filter(
        (t) => (t.assigned_to_type === 'ai_staff' && assignedMatch.includes(t.assigned_to_id)) || createdMatch.includes(t.created_by_id),
      );
    });

    const result = await getAgentDetail('agent-process-1');

    expect(result!.tickets).toHaveLength(1);
    expect(result!.tickets[0].id).toBe('t-legacy');
  });

  it('boundary: returns null for a non-existent agent id, rather than throwing or fabricating a shape', async () => {
    mockAgentFindByPk.mockResolvedValue(null);
    const result = await getAgentDetail('does-not-exist');
    expect(result).toBeNull();
    expect(mockTicketFindAll).not.toHaveBeenCalled();
  });

  it('boundary: an agent with no linked AdminUser (not yet an identity-seeded agent) returns identity:null, live_status:unknown, and an empty ticket list — never crashes', async () => {
    mockAdminFindOne.mockResolvedValue(null);
    const result = await getAgentDetail('agent-1');
    expect(result!.identity).toBeNull();
    expect(result!.live_status).toBe('unknown');
    expect(result!.tickets).toEqual([]);
    expect(mockTicketFindAll).not.toHaveBeenCalled();
    // capabilities.reads/produces still derive from tools_granted (identity-
    // independent), but produced_ticket_types is honestly empty — no admin
    // identity means no match list to query tickets by at all.
    expect(result!.capabilities.produced_ticket_types).toEqual([]);
  });
});
