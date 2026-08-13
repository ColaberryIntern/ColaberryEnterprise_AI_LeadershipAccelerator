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

  it('boundary (the core check): a Ticket.findAll filtered on assigned_to_type/assigned_to_id returns ONLY the agent\'s own tickets, not every ticket in the system', async () => {
    // Simulate the real DB filter's effect: the mock only "returns" what a real
    // WHERE assigned_to_id = 'admin-1' clause would — proving the SERVICE
    // constructs that filter correctly, which is what actually protects this.
    mockTicketFindAll.mockImplementation(async (query: any) => {
      const allTickets = [
        { id: 't-reese', assigned_to_type: 'ai_staff', assigned_to_id: 'admin-1', title: 'Reese ticket', status: 'todo', priority: 'medium', type: 'student_support', created_at: new Date(), updated_at: new Date() },
        { id: 't-other', assigned_to_type: 'ai_staff', assigned_to_id: 'some-other-agent-admin-id', title: 'Someone else\'s ticket', status: 'todo', priority: 'medium', type: 'student_support', created_at: new Date(), updated_at: new Date() },
      ];
      return allTickets.filter(
        (t) => t.assigned_to_type === query.where.assigned_to_type && t.assigned_to_id === query.where.assigned_to_id,
      );
    });

    const result = await getAgentDetail('agent-1');

    expect(result!.tickets).toHaveLength(1);
    expect(result!.tickets[0].id).toBe('t-reese');
    expect(mockTicketFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { assigned_to_type: 'ai_staff', assigned_to_id: 'admin-1' } }),
    );
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
  });
});
