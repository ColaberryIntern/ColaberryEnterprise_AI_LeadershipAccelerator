/**
 * Agent Detail service — the key boundary case per plan.md T011: given a
 * seeded Reese agent + 2 tickets (one belonging to Reese, one belonging to a
 * different assigned_to_id), the service returns exactly the 1 ticket that
 * belongs to Reese, proving the filter is correct.
 */
jest.mock('../../../models/AiAgent', () => ({ findByPk: jest.fn() }));
jest.mock('../../../models/AdminUser', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/Enrollment', () => ({ findOne: jest.fn(), findByPk: jest.fn() }));
jest.mock('../../../models/CommunityMember', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/OrgMember', () => ({ findByPk: jest.fn() }));
jest.mock('../../../models', () => ({ Ticket: { findAll: jest.fn() } }));
jest.mock('../../communityService', () => ({ derivePresence: jest.fn() }));
jest.mock('../../ticketCreatorReportsToResolver', () => ({ resolveReportsToChainWithTrail: jest.fn() }));
// Ticket Count Sync fix (2026-08-21, session CC-20260818-x4nk continued) —
// getAgentDetail() now calls the REAL countOpenTicketsForAgent(), which itself
// calls Ticket.count(). This file's own '../../../models' mock above has no
// `.count` (only `findAll`), so without this mock, that call would throw
// `TypeError: Ticket.count is not a function` for every test where adminUser
// is truthy (i.e. almost all of them, per beforeEach below).
// Trust Contract fix (2026-08-24) — getAgentDetail() now also calls the REAL
// getLastTicketActivityForAgent() (same module), mocked alongside its sibling.
jest.mock('../../workforce/liveAgentsService', () => ({ countOpenTicketsForAgent: jest.fn(), getLastTicketActivityForAgent: jest.fn() }));

import { Op } from 'sequelize';
import AiAgent from '../../../models/AiAgent';
import AdminUser from '../../../models/AdminUser';
import Enrollment from '../../../models/Enrollment';
import CommunityMember from '../../../models/CommunityMember';
import OrgMember from '../../../models/OrgMember';
import { Ticket } from '../../../models';
import { derivePresence } from '../../communityService';
import { resolveReportsToChainWithTrail } from '../../ticketCreatorReportsToResolver';
import { countOpenTicketsForAgent, getLastTicketActivityForAgent } from '../../workforce/liveAgentsService';
import { getAgentDetail } from '../agentDetailService';

const mockAgentFindByPk = AiAgent.findByPk as unknown as jest.Mock;
const mockAdminFindOne = AdminUser.findOne as unknown as jest.Mock;
const mockEnrollmentFindOne = Enrollment.findOne as unknown as jest.Mock;
const mockEnrollmentFindByPk = Enrollment.findByPk as unknown as jest.Mock;
const mockMemberFindOne = CommunityMember.findOne as unknown as jest.Mock;
const mockOrgMemberFindByPk = OrgMember.findByPk as unknown as jest.Mock;
const mockTicketFindAll = Ticket.findAll as unknown as jest.Mock;
const mockDerivePresence = derivePresence as unknown as jest.Mock;
const mockResolveChain = resolveReportsToChainWithTrail as unknown as jest.Mock;
const mockCountOpenTickets = countOpenTicketsForAgent as unknown as jest.Mock;
const mockLastActivity = getLastTicketActivityForAgent as unknown as jest.Mock;

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
  mockCountOpenTickets.mockResolvedValue(0);
  mockLastActivity.mockResolvedValue(null);
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
    expect(result!.agent.autonomy_level).toBeNull(); // never reactivated through the Phase C flow — honest null
    expect(result!.identity).toMatchObject({ admin_user_id: 'admin-1', email: 'reese@colaberry.com', is_ai_operated: true });
    expect(result!.live_status).toBe('online');
    expect(result!.tickets).toHaveLength(1);
  });

  // AI Workforce Reset, Phase C (2026-08-24) — Permitted dimension of the
  // Trust Contract: a real, previously-reactivated agent's chosen autonomy
  // level passes through verbatim.
  it("agent.autonomy_level passes through the real, previously-reactivated value verbatim", async () => {
    mockAgentFindByPk.mockResolvedValue({ ...reeseAgent, autonomy_level: 'act_audited' });

    const result = await getAgentDetail('agent-1');

    expect(result!.agent.autonomy_level).toBe('act_audited');
  });

  // Ticket Count Sync fix (2026-08-21, session CC-20260818-x4nk continued) —
  // AgentDetailPage's "Open tickets" stat used to be derived client-side from
  // `tickets.filter(open).length`, but `tickets` is capped at MAX_TICKETS (50,
  // most-recent-first) — inaccurate for any agent whose true open volume
  // exceeds that cap (e.g. InboxCaseEngine, ~90-294 open tickets live). This
  // proves the new field is genuinely independent of the capped list.
  it('open_ticket_count reflects the TRUE count via the shared per-agent query, even when it exceeds the 50-ticket tickets-list cap', async () => {
    mockCountOpenTickets.mockResolvedValue(294); // far more than MAX_TICKETS
    mockTicketFindAll.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => ({
        id: `t-${i}`, ticket_number: i, title: `Ticket ${i}`, status: 'todo', priority: 'medium',
        type: 'agent_action', created_at: new Date(), updated_at: new Date(),
      })),
    ); // the capped, most-recent-first list — exactly 50, never more

    const result = await getAgentDetail('agent-1');

    expect(result!.tickets).toHaveLength(50); // the cap, unchanged
    expect(result!.open_ticket_count).toBe(294); // NOT derived from the capped list's length
    expect(mockCountOpenTickets).toHaveBeenCalledWith('admin-1', reeseAgent);
  });

  it('open_ticket_count is 0, and countOpenTicketsForAgent is never called, when there is no linked AdminUser identity', async () => {
    mockAdminFindOne.mockResolvedValue(null);

    const result = await getAgentDetail('agent-1');

    expect(result!.open_ticket_count).toBe(0);
    expect(mockCountOpenTickets).not.toHaveBeenCalled();
  });

  // Trust Contract fix (2026-08-24) — Ali, live: "Reese has several tickets
  // that have been opened... but this says it's never been run." Proves
  // trust_contract.last_activity_at carries the real, ticket-derived signal
  // for an event-driven agent whose scheduler-tracked last_run_at is null.
  it('trust_contract.last_activity_at reflects the real most-recent ticket activity, independent of last_run_at', async () => {
    const recentActivity = new Date('2026-08-24T10:00:00Z');
    mockLastActivity.mockResolvedValue(recentActivity);

    const result = await getAgentDetail('agent-1');

    expect(result!.trust_contract.last_run_at).toBeNull(); // reeseAgent has no scheduler columns set — honestly null
    expect(result!.trust_contract.last_activity_at).toBe(recentActivity);
    expect(mockLastActivity).toHaveBeenCalledWith('admin-1', reeseAgent);
  });

  it('trust_contract.last_activity_at is null, and getLastTicketActivityForAgent is never called, when there is no linked AdminUser identity', async () => {
    mockAdminFindOne.mockResolvedValue(null);

    const result = await getAgentDetail('agent-1');

    expect(result!.trust_contract.last_activity_at).toBeNull();
    expect(mockLastActivity).not.toHaveBeenCalled();
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

  // Tool & capability drill-down (2026-08-23) — capabilities.by_tool carries
  // the per-tool breakdown AgentDetailPage's drill-down renders, straight
  // through from deriveAgentCapabilities().
  it('capabilities.by_tool: passes through the per-tool breakdown for the AgentDetailPage drill-down, in tools_granted order', async () => {
    mockAgentFindByPk.mockResolvedValue({ ...reeseAgent, tools_granted: ['respond_to_dm', 'a_tool_from_the_future'] });

    const result = await getAgentDetail('agent-1');

    expect(result!.capabilities.by_tool).toEqual([
      { tool: 'respond_to_dm', reads: ["The student's direct-message conversation history"], produces: ['A reply message in the student DM thread'], documented: true },
      { tool: 'a_tool_from_the_future', reads: [], produces: [], documented: false },
    ]);
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

  // Trust Contract (2026-08-24) — Ali, live: "All Agents should have a trust
  // contract based on [Trust Before Intelligence]." The "Instant" dimension:
  // real, pre-existing AiAgent schedule/run columns, never fabricated.
  describe('trust_contract', () => {
    it("happy path: a cron-tracked agent (e.g. a Strategy Architect) returns its real schedule/run/error data verbatim", async () => {
      const lastRunAt = new Date('2026-08-24T11:28:07.264Z');
      const lastErrorAt = new Date('2026-08-24T05:00:00.000Z');
      mockAgentFindByPk.mockResolvedValue({
        ...reeseAgent,
        status: 'idle',
        trigger_type: 'cron',
        schedule: '28 */6 * * *',
        last_run_at: lastRunAt,
        run_count: 623,
        error_count: 4,
        avg_duration_ms: 5791,
        last_error: 'out of shared memory',
        last_error_at: lastErrorAt,
      });

      const result = await getAgentDetail('agent-1');

      expect(result!.trust_contract).toEqual({
        trigger_type: 'cron',
        schedule: '28 */6 * * *',
        status: 'idle',
        last_run_at: lastRunAt,
        run_count: 623,
        error_count: 4,
        avg_duration_ms: 5791,
        last_error: 'out of shared memory',
        last_error_at: lastErrorAt,
      });
    });

    it("honesty boundary: an identity-only agent never invoked through the scheduler (e.g. Reese) returns honest null/zero, never a fabricated value", async () => {
      mockAgentFindByPk.mockResolvedValue({
        ...reeseAgent,
        status: 'idle',
        trigger_type: 'event_driven',
        schedule: '',
        last_run_at: null,
        run_count: 0,
        error_count: 0,
        avg_duration_ms: null,
        last_error: null,
        last_error_at: null,
      });

      const result = await getAgentDetail('agent-1');

      expect(result!.trust_contract).toEqual({
        trigger_type: 'event_driven',
        schedule: null, // empty string normalized to null, not shown as a fake schedule
        status: 'idle',
        last_run_at: null,
        run_count: 0,
        error_count: 0,
        avg_duration_ms: null,
        last_error: null,
        last_error_at: null,
      });
    });

    it('boundary: a null trigger_type (never registered with the scheduler at all) is disclosed as null, not defaulted to a guessed value', async () => {
      mockAgentFindByPk.mockResolvedValue({ ...reeseAgent, trigger_type: null, schedule: null });

      const result = await getAgentDetail('agent-1');

      expect(result!.trust_contract.trigger_type).toBeNull();
    });
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

  // Org-chart hierarchy build (2026-08-19) — the "Reports to" section on
  // AgentDetailPage. reeseAgent's fixture has no reports_to_type set, so all
  // 8 tests above never touch resolveReportsToChainWithTrail/OrgMember at
  // all — this new describe block covers the field itself in isolation.
  describe('reports_to', () => {
    it('happy path: an agent with reports_to_type set resolves a trail and a real human identity', async () => {
      const staffAgent = { ...reeseAgent, reports_to_type: 'agent', reports_to_id: 'corybrain-id' };
      mockAgentFindByPk.mockResolvedValue(staffAgent);
      mockResolveChain.mockResolvedValue({
        resolvedHumanId: 'kes-org-member-id',
        trail: ['Reese (agent)', 'workforce_intelligence_engine (agent) -> [human]'],
      });
      mockOrgMemberFindByPk.mockResolvedValue({ id: 'kes-org-member-id', email: 'kesetebirhan@gmail.com', enrollment_id: null });

      const result = await getAgentDetail('agent-1');

      expect(result!.reports_to).not.toBeNull();
      expect(result!.reports_to!.trail).toEqual(['Reese (agent)', 'workforce_intelligence_engine (agent) -> [human]']);
      expect(result!.reports_to!.resolved_human).toEqual({ id: 'kes-org-member-id', name: 'kesetebirhan@gmail.com', email: 'kesetebirhan@gmail.com' });
    });

    it('prefers the resolved human\'s real Enrollment.full_name over their bare email, same pattern as orgService.ts::getRoster()', async () => {
      const leadershipAgent = { ...reeseAgent, reports_to_type: 'human', reports_to_id: 'ali-org-member-id' };
      mockAgentFindByPk.mockResolvedValue(leadershipAgent);
      mockResolveChain.mockResolvedValue({ resolvedHumanId: 'ali-org-member-id', trail: ['Reese (agent) -> [human]'] });
      mockOrgMemberFindByPk.mockResolvedValue({ id: 'ali-org-member-id', email: 'ali@colaberry.com', enrollment_id: 'enr-ali' });
      mockEnrollmentFindByPk.mockResolvedValue({ id: 'enr-ali', full_name: 'Ali Muwwakkil' });

      const result = await getAgentDetail('agent-1');

      expect(result!.reports_to!.resolved_human!.name).toBe('Ali Muwwakkil');
    });

    it('failure/boundary: reports_to_type is null (the common case for non-ticket-creating agents) -> reports_to: null, never an empty object or a thrown error', async () => {
      mockAgentFindByPk.mockResolvedValue({ ...reeseAgent, reports_to_type: null, reports_to_id: null });

      const result = await getAgentDetail('agent-1');

      expect(result!.reports_to).toBeNull();
      expect(mockResolveChain).not.toHaveBeenCalled();
      expect(mockOrgMemberFindByPk).not.toHaveBeenCalled();
    });

    it('boundary: the chain fails to resolve (dangling) -> reports_to.trail is populated but resolved_human is null, never fabricated', async () => {
      const orphanAgent = { ...reeseAgent, agent_name: 'OrphanedAgent', reports_to_type: 'agent', reports_to_id: 'nonexistent-id' };
      mockAgentFindByPk.mockImplementation(async (id: string) => (id === 'agent-1' ? orphanAgent : null));
      mockResolveChain.mockResolvedValue({ resolvedHumanId: null, trail: ['OrphanedAgent (agent) -> [dangling]'] });

      const result = await getAgentDetail('agent-1');

      expect(result!.reports_to).toEqual({ trail: ['OrphanedAgent (agent) -> [dangling]'], resolved_human: null, immediate_agent: null });
      expect(mockOrgMemberFindByPk).not.toHaveBeenCalled();
    });

    // 2026-08-23 — "I'd like to have a link to the agent they report to"
    // (Ali, reported 3rd time alongside the ticket-filter bug). immediate_agent
    // is the DIRECT next hop, only populated when it's another agent — lets
    // AgentDetailPage link straight to that agent's own detail page.
    describe('immediate_agent', () => {
      it('happy path: reports_to_type=agent resolves the real next-hop agent id + name for linking', async () => {
        const staffAgent = { ...reeseAgent, id: 'agent-1', reports_to_type: 'agent', reports_to_id: 'corybrain-id' };
        const leadershipAgent = { id: 'corybrain-id', agent_name: 'CoryBrain' };
        mockAgentFindByPk.mockImplementation(async (id: string) => {
          if (id === 'agent-1') return staffAgent;
          if (id === 'corybrain-id') return leadershipAgent;
          return null;
        });
        mockResolveChain.mockResolvedValue({ resolvedHumanId: 'ali-org-member-id', trail: ['Reese (agent)', 'CoryBrain (agent) -> [human]'] });
        mockOrgMemberFindByPk.mockResolvedValue({ id: 'ali-org-member-id', email: 'ali@colaberry.com', enrollment_id: null });

        const result = await getAgentDetail('agent-1');

        expect(result!.reports_to!.immediate_agent).toEqual({ id: 'corybrain-id', name: 'CoryBrain' });
      });

      it('null when reports_to_type=human — a human is not an agent to link to (resolved_human already covers that case)', async () => {
        const leadershipAgent = { ...reeseAgent, id: 'agent-1', reports_to_type: 'human', reports_to_id: 'ali-org-member-id' };
        mockAgentFindByPk.mockResolvedValue(leadershipAgent);
        mockResolveChain.mockResolvedValue({ resolvedHumanId: 'ali-org-member-id', trail: ['Reese (agent) -> [human]'] });
        mockOrgMemberFindByPk.mockResolvedValue({ id: 'ali-org-member-id', email: 'ali@colaberry.com', enrollment_id: null });

        const result = await getAgentDetail('agent-1');

        expect(result!.reports_to!.immediate_agent).toBeNull();
      });

      it('honesty boundary: reports_to_type=agent but the target id doesn\'t resolve to a real row -> null, never a dead link', async () => {
        const staffAgent = { ...reeseAgent, id: 'agent-1', reports_to_type: 'agent', reports_to_id: 'nonexistent-id' };
        mockAgentFindByPk.mockImplementation(async (id: string) => (id === 'agent-1' ? staffAgent : null));
        mockResolveChain.mockResolvedValue({ resolvedHumanId: null, trail: ['Reese (agent) -> [dangling]'] });

        const result = await getAgentDetail('agent-1');

        expect(result!.reports_to!.immediate_agent).toBeNull();
      });
    });
  });
});
