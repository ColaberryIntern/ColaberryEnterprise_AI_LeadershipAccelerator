/**
 * Agent Detail service — the key boundary case per plan.md T011: given a
 * seeded Reese agent + 2 tickets (one belonging to Reese, one belonging to a
 * different assigned_to_id), the service returns exactly the 1 ticket that
 * belongs to Reese, proving the filter is correct.
 */
jest.mock('../../../models/AiAgent', () => ({ findByPk: jest.fn(), findAll: jest.fn() }));
jest.mock('../../../models/AdminUser', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/Enrollment', () => ({ findOne: jest.fn(), findByPk: jest.fn() }));
jest.mock('../../../models/CommunityMember', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/OrgMember', () => ({ findByPk: jest.fn() }));
// Dashboard redesign, Slice 2a (2026-09-19) — getAgentDetail() now also
// queries TicketActivity for the Work tab's "needs a reply" derivation.
jest.mock('../../../models', () => ({ Ticket: { findAll: jest.fn() }, TicketActivity: { findAll: jest.fn() } }));
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
// Dara v2 Phase 6 — same for getOldestOpenTicketAge() (open-ticket accountability).
jest.mock('../../workforce/liveAgentsService', () => ({ countOpenTicketsForAgent: jest.fn(), getLastTicketActivityForAgent: jest.fn(), getOldestOpenTicketAge: jest.fn() }));
// Trust Contract Phase 1 (2026-08-26) — the 3 new real-evidence fields.
jest.mock('../../agentPersonaVersionHistoryService', () => ({ getPersonaVersionHistory: jest.fn() }));
jest.mock('../../trustMetricsService', () => ({ agentCostRows: jest.fn() }));
jest.mock('../../agentAuthorizationService', () => ({
  getAgentAuthorizationSummary: jest.fn(),
  // Real-enforcement scoping, Phase 3 (2026-09-20) — getAbacMode() defaults to the real,
  // untouched platform default ('shadow'); resolveEffectiveMode() is the real, unmocked
  // implementation (a trivial `override ?? globalMode`) so this file's own tests exercise the
  // genuine resolution logic rather than a second, parallel fake of it.
  getAbacMode: jest.fn().mockResolvedValue('shadow'),
  resolveEffectiveMode: (globalMode: string, override: string | null) => override ?? globalMode,
}));
// AI Workforce Management, Checkpoint E — the generic GOALS dimension score.
jest.mock('../../agentGoalsDimensionsService', () => ({ computeAgentGoalsDimensions: jest.fn() }));
// Reese Product Phase 1, R7 — the new Reese-only employee_facts field's own
// dependencies. Every test's default fixture is agent_name: 'Reese', so this
// path runs in nearly every test here — mocked with a harmless default
// (charter:null, no room message) so existing assertions are unaffected.
jest.mock('../../../models/RoomMessage', () => ({ findOne: jest.fn() }));
jest.mock('../../agentRoleCharterService', () => ({ getRoleCharter: jest.fn() }));

import { Op } from 'sequelize';
import AiAgent from '../../../models/AiAgent';
import AdminUser from '../../../models/AdminUser';
import Enrollment from '../../../models/Enrollment';
import CommunityMember from '../../../models/CommunityMember';
import OrgMember from '../../../models/OrgMember';
import { Ticket, TicketActivity } from '../../../models';
import { derivePresence } from '../../communityService';
import { resolveReportsToChainWithTrail } from '../../ticketCreatorReportsToResolver';
import { countOpenTicketsForAgent, getLastTicketActivityForAgent, getOldestOpenTicketAge } from '../../workforce/liveAgentsService';
import { getPersonaVersionHistory } from '../../agentPersonaVersionHistoryService';
import { agentCostRows } from '../../trustMetricsService';
import { getAgentAuthorizationSummary, getAbacMode } from '../../agentAuthorizationService';
import { computeAgentGoalsDimensions } from '../../agentGoalsDimensionsService';
import RoomMessage from '../../../models/RoomMessage';
import { getRoleCharter } from '../../agentRoleCharterService';
import { getAgentDetail } from '../agentDetailService';

const mockAgentFindByPk = AiAgent.findByPk as unknown as jest.Mock;
const mockGetAbacMode = getAbacMode as unknown as jest.Mock;
const mockAgentFindAll = AiAgent.findAll as unknown as jest.Mock;
const mockAdminFindOne = AdminUser.findOne as unknown as jest.Mock;
const mockEnrollmentFindOne = Enrollment.findOne as unknown as jest.Mock;
const mockEnrollmentFindByPk = Enrollment.findByPk as unknown as jest.Mock;
const mockMemberFindOne = CommunityMember.findOne as unknown as jest.Mock;
const mockOrgMemberFindByPk = OrgMember.findByPk as unknown as jest.Mock;
const mockTicketFindAll = Ticket.findAll as unknown as jest.Mock;
const mockTicketActivityFindAll = TicketActivity.findAll as unknown as jest.Mock;
const mockDerivePresence = derivePresence as unknown as jest.Mock;
const mockResolveChain = resolveReportsToChainWithTrail as unknown as jest.Mock;
const mockCountOpenTickets = countOpenTicketsForAgent as unknown as jest.Mock;
const mockLastActivity = getLastTicketActivityForAgent as unknown as jest.Mock;
const mockOldestOpenTicketAge = getOldestOpenTicketAge as unknown as jest.Mock;
const mockPersonaHistory = getPersonaVersionHistory as unknown as jest.Mock;
const mockCostRows = agentCostRows as unknown as jest.Mock;
const mockAuthSummary = getAgentAuthorizationSummary as unknown as jest.Mock;
const mockGoalsDimensions = computeAgentGoalsDimensions as unknown as jest.Mock;
const mockRoomMessageFindOne = RoomMessage.findOne as unknown as jest.Mock;
const mockGetRoleCharter = getRoleCharter as unknown as jest.Mock;

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
  mockTicketActivityFindAll.mockResolvedValue([]);
  mockCountOpenTickets.mockResolvedValue(0);
  mockLastActivity.mockResolvedValue(null);
  mockOldestOpenTicketAge.mockResolvedValue(null);
  mockAgentFindAll.mockResolvedValue([]);
  mockPersonaHistory.mockResolvedValue([]);
  mockCostRows.mockResolvedValue([]);
  mockAuthSummary.mockResolvedValue({ window_days: 30, total: 0, allow: 0, approval: 0, block: 0, enforced_count: 0 });
  mockGoalsDimensions.mockResolvedValue({ goals: [], goalsOverall: 0 });
  mockRoomMessageFindOne.mockResolvedValue(null);
  mockGetRoleCharter.mockResolvedValue({ agentId: 'agent-1', charter: null });
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

  // Trust & Control slice 2 (2026-09-03) — real, previously-unexposed
  // AiAgent columns now pass through verbatim. Set via a local override
  // (never the shared reeseAgent fixture) — the related_tasks honesty-
  // boundary test above depends on the base fixture having no `module`.
  it('agent.department/module/source_file/execution-limits/autonomy_level_set_at pass through the real values verbatim', async () => {
    const setAt = new Date('2026-08-25T12:00:00Z');
    mockAgentFindByPk.mockResolvedValue({
      ...reeseAgent, department: 'student_success', module: 'reese', source_file: 'reeseWorker.ts',
      max_runs_per_hour: 60, max_writes_per_execution: 100, max_proposals_per_run: 50,
      autonomy_level_set_at: setAt,
    });

    const result = await getAgentDetail('agent-1');

    expect(result!.agent.department).toBe('student_success');
    expect(result!.agent.module).toBe('reese');
    expect(result!.agent.source_file).toBe('reeseWorker.ts');
    expect(result!.agent.max_runs_per_hour).toBe(60);
    expect(result!.agent.max_writes_per_execution).toBe(100);
    expect(result!.agent.max_proposals_per_run).toBe(50);
    expect(result!.agent.autonomy_level_set_at).toEqual(setAt);
  });

  // Fleet-wide autonomy-level auto-classification, Phase 2 (2026-09-14) —
  // real autonomy_level_source values pass through verbatim, and an agent
  // nobody has ever classified reads as an honest null, never a fabricated
  // 'manual'.
  it('agent.autonomy_level_source passes through the real value, or null when never classified', async () => {
    mockAgentFindByPk.mockResolvedValue({ ...reeseAgent, autonomy_level_source: 'auto' });
    const result = await getAgentDetail('agent-1');
    expect(result!.agent.autonomy_level_source).toBe('auto');

    mockAgentFindByPk.mockResolvedValue({ ...reeseAgent, autonomy_level_source: undefined });
    const result2 = await getAgentDetail('agent-1');
    expect(result2!.agent.autonomy_level_source).toBeNull();
  });

  // Real-enforcement scoping, Phase 3 (2026-09-20) — the per-agent shadow/enforce switch Ali
  // asked for. abac_effective_mode/abac_global_default are computed server-side via the SAME
  // resolution logic authorizeAgentAction() itself uses, so this page can never drift from
  // what actually governs this agent's real calls.
  it('no override: abac_mode_override is null, abac_effective_mode equals the current global default', async () => {
    mockGetAbacMode.mockResolvedValue('enforce');
    mockAgentFindByPk.mockResolvedValue({ ...reeseAgent, abac_mode_override: undefined });

    const result = await getAgentDetail('agent-1');

    expect(result!.agent.abac_mode_override).toBeNull();
    expect(result!.agent.abac_global_default).toBe('enforce');
    expect(result!.agent.abac_effective_mode).toBe('enforce'); // no override → follows the global default
  });

  it('a real override reflects in abac_effective_mode, overriding the global default', async () => {
    mockGetAbacMode.mockResolvedValue('shadow');
    const setAt = new Date('2026-09-20T18:00:00Z');
    mockAgentFindByPk.mockResolvedValue({
      ...reeseAgent, abac_mode_override: 'enforce', abac_mode_override_set_at: setAt, abac_mode_override_set_by: 'ali@colaberry.com',
    });

    const result = await getAgentDetail('agent-1');

    expect(result!.agent.abac_mode_override).toBe('enforce');
    expect(result!.agent.abac_mode_override_set_at).toEqual(setAt);
    expect(result!.agent.abac_mode_override_set_by).toBe('ali@colaberry.com');
    expect(result!.agent.abac_global_default).toBe('shadow');
    expect(result!.agent.abac_effective_mode).toBe('enforce'); // the override wins over the global default
  });

  it("global 'off' always wins in the reported effective mode, even when a per-agent override to enforce is set", async () => {
    mockGetAbacMode.mockResolvedValue('off');
    mockAgentFindByPk.mockResolvedValue({ ...reeseAgent, abac_mode_override: 'enforce' });

    const result = await getAgentDetail('agent-1');

    expect(result!.agent.abac_global_default).toBe('off');
    expect(result!.agent.abac_effective_mode).toBe('off'); // off always wins, even over a real override
  });

  // UI follow-up to fleet-wide autonomy classification (2026-09-15) — Ali:
  // "why give the user the ability to change it... we might as well set the
  // default and color coordinate it and have a popup that explains why it
  // has been given this autonomy level." autonomy_explanation is computed
  // LIVE against the agent's CURRENT tools_granted on every call (the same
  // pure classifyAgentAutonomyLevel() the fleet backfill script and the
  // ongoing-sync service both call) — never a stored, staleness-prone value.
  it('autonomy_explanation reflects the real, LIVE classification of this agent\'s CURRENT tools_granted — reeseAgent\'s real respond_to_dm classifies as communicate', async () => {
    const result = await getAgentDetail('agent-1'); // reeseAgent fixture: tools_granted: ['respond_to_dm']

    expect(result!.autonomy_explanation.level).toBe('communicate');
    expect(result!.autonomy_explanation.matched_tool).toBe('respond_to_dm');
    expect(result!.autonomy_explanation.reason).toContain('respond_to_dm');
  });

  it('autonomy_explanation is computed fresh from CURRENT tools_granted, independent of the stored autonomy_level — proves it self-corrects rather than echoing the stale stored value', async () => {
    // Stored level says 'observe' (e.g. set by a human before this agent's
    // tools_granted grew to include respond_to_dm) — the live explanation
    // must reflect what the tools ACTUALLY earn today, not the stale stored
    // value, so the frontend can detect and disclose exactly this drift.
    mockAgentFindByPk.mockResolvedValue({ ...reeseAgent, autonomy_level: 'observe', autonomy_level_set_at: new Date('2026-01-01') });

    const result = await getAgentDetail('agent-1');

    expect(result!.agent.autonomy_level).toBe('observe');
    expect(result!.autonomy_explanation.level).toBe('communicate');
  });

  it('autonomy_explanation honestly defaults to observe with no matched_tool when the agent has no tools_granted at all', async () => {
    mockAgentFindByPk.mockResolvedValue({ ...reeseAgent, tools_granted: null });

    const result = await getAgentDetail('agent-1');

    expect(result!.autonomy_explanation.level).toBe('observe');
    expect(result!.autonomy_explanation.matched_tool).toBeNull();
    expect(result!.autonomy_explanation.reason).toMatch(/no tools_granted/i);
  });

  // Trust & Control slice 2 (2026-09-03) — an unclassified agent (the
  // common case for most of the fleet, per AiAgent.ts's own comment) must
  // read as an honest null, never a fabricated department.
  it('agent.department is honestly null for an unclassified agent', async () => {
    mockAgentFindByPk.mockResolvedValue({ ...reeseAgent, department: null });

    const result = await getAgentDetail('agent-1');

    expect(result!.agent.department).toBeNull();
  });

  // Trust & Control slice 2 (2026-09-03) — real, live-caught bug: an
  // on-demand agent (e.g. CoryStrategicAgent) that never went through the
  // registry-seed default-assignment path genuinely has `null` execution
  // limits in the database, despite AiAgent.ts's class declaring them
  // non-nullable. This endpoint must pass real `null` through honestly,
  // never a fabricated number and never a silently-substituted default.
  it('agent execution limits are honestly null for an agent never touched by registry-seed defaults', async () => {
    mockAgentFindByPk.mockResolvedValue({
      ...reeseAgent, max_runs_per_hour: null, max_writes_per_execution: null, max_proposals_per_run: null,
    });

    const result = await getAgentDetail('agent-1');

    expect(result!.agent.max_runs_per_hour).toBeNull();
    expect(result!.agent.max_writes_per_execution).toBeNull();
    expect(result!.agent.max_proposals_per_run).toBeNull();
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

  // Dara v2 Phase 6 ("open-ticket accountability") — real, informational age
  // of the oldest still-open ticket, via the shared getOldestOpenTicketAge().
  it('oldest_open_ticket_age_days reflects the real age via the shared query', async () => {
    mockOldestOpenTicketAge.mockResolvedValue({ oldestOpenCreatedAt: new Date('2026-08-01T00:00:00Z'), ageDays: 17 });

    const result = await getAgentDetail('agent-1');

    expect(result!.oldest_open_ticket_age_days).toBe(17);
    expect(mockOldestOpenTicketAge).toHaveBeenCalledWith('admin-1', reeseAgent);
  });

  it('oldest_open_ticket_age_days is null (never a fabricated 0) when the agent genuinely has zero open tickets', async () => {
    mockOldestOpenTicketAge.mockResolvedValue(null);

    const result = await getAgentDetail('agent-1');

    expect(result!.oldest_open_ticket_age_days).toBeNull();
  });

  it('oldest_open_ticket_age_days is null, and getOldestOpenTicketAge is never called, when there is no linked AdminUser identity', async () => {
    mockAdminFindOne.mockResolvedValue(null);

    const result = await getAgentDetail('agent-1');

    expect(result!.oldest_open_ticket_age_days).toBeNull();
    expect(mockOldestOpenTicketAge).not.toHaveBeenCalled();
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
        last_activity_at: null, // a cron-tracked agent's own last_run_at is the real signal; no ticket-derived fallback mocked here
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
        last_activity_at: null, // mockLastActivity defaults to null — this agent also has no ticket history in this test
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

  // Task visibility (2026-08-26) — Ali, live, looking at Reese's real page:
  // "I need to see what those [tasks] are... which tickets each one creates
  // ...what triggers them, what they are looking for, why they triggered."
  describe('ticket_breakdown', () => {
    it('groups real tickets by type, sub-grouped by real metadata.signal_type, both sorted by count descending', async () => {
      mockTicketFindAll.mockResolvedValue([
        { id: 't1', type: 'reese_autonomous_outreach', metadata: { signal_type: 'inactivity' } },
        { id: 't2', type: 'reese_autonomous_outreach', metadata: { signal_type: 'inactivity' } },
        { id: 't3', type: 'reese_autonomous_outreach', metadata: { signal_type: 'behavior_anomaly' } },
        { id: 't4', type: 'student_support', metadata: null },
      ]);

      const result = await getAgentDetail('agent-1');

      expect(result!.ticket_breakdown).toEqual([
        {
          type: 'reese_autonomous_outreach',
          count: 3,
          by_signal: [
            { signal_type: 'inactivity', count: 2 },
            { signal_type: 'behavior_anomaly', count: 1 },
          ],
        },
        { type: 'student_support', count: 1, by_signal: [] },
      ]);
    });

    it("honesty boundary: a type whose tickets carry no metadata.signal_type at all gets by_signal: [], never a fabricated 'unknown' bucket", async () => {
      mockTicketFindAll.mockResolvedValue([
        { id: 't1', type: 'student_support', metadata: null },
        { id: 't2', type: 'student_support' }, // metadata entirely absent, not just null
      ]);

      const result = await getAgentDetail('agent-1');

      expect(result!.ticket_breakdown).toEqual([{ type: 'student_support', count: 2, by_signal: [] }]);
    });

    it('is empty when there is no linked AdminUser identity — no match list means no ticket query at all', async () => {
      mockAdminFindOne.mockResolvedValue(null);
      const result = await getAgentDetail('agent-1');
      expect(result!.ticket_breakdown).toEqual([]);
    });
  });

  // Task visibility (2026-08-26) — "I should be able to see [what tasks
  // trigger]." Sibling AiAgent rows sharing this agent's real `module` (e.g.
  // Reese's own ReeseAutonomousOutreachSweep/ReeseOutreachFollowUps cron
  // rows, registered separately in agentRegistrySeed.ts).
  describe('related_tasks', () => {
    it('happy path: returns sibling AiAgent rows sharing this agent\'s real module, excluding itself, ordered by agent_name', async () => {
      mockAgentFindByPk.mockResolvedValue({ ...reeseAgent, module: 'reese' });
      const sweepAgent = {
        id: 'sweep-id', agent_name: 'ReeseAutonomousOutreachSweep', description: 'Daily scan for risk signals.',
        trigger_type: 'cron', schedule: '0 15 * * *', enabled: true, status: 'idle',
        last_run_at: new Date('2026-08-25T15:00:00Z'), run_count: 12, error_count: 0,
      };
      mockAgentFindAll.mockResolvedValue([sweepAgent]);

      const result = await getAgentDetail('agent-1');

      expect(mockAgentFindAll).toHaveBeenCalledWith({
        where: { module: 'reese', id: { [Op.ne]: 'agent-1' } },
        order: [['agent_name', 'ASC']],
      });
      expect(result!.related_tasks).toEqual([
        {
          id: 'sweep-id', agent_name: 'ReeseAutonomousOutreachSweep', description: 'Daily scan for risk signals.',
          trigger_type: 'cron', schedule: '0 15 * * *', enabled: true, status: 'idle',
          last_run_at: new Date('2026-08-25T15:00:00Z'), run_count: 12, error_count: 0,
          // R9 — no ticket rows mocked in this test, so honestly null.
          last_ticket: null,
        },
      ]);
    });

    it("honesty boundary: [] when this agent has no module set (most agents) — the module-based sibling query itself is skipped (AiAgent.findAll is still called once, for the separate owned_behaviors query below, which has no module gate)", async () => {
      // reeseAgent fixture has no `module` field at all.
      const result = await getAgentDetail('agent-1');

      expect(result!.related_tasks).toEqual([]);
      expect(mockAgentFindAll).not.toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ module: expect.anything() }) }));
    });
  });

  // AI Employee Consolidation Program (2026-09-15/16) — real ownership via
  // parent_agent_id, distinct from related_tasks' same-module inference above.
  describe('owned_behaviors', () => {
    it("happy path: returns real AiAgent rows this agent OWNS via parent_agent_id, ordered by agent_name", async () => {
      const ownedRow = {
        id: 'director-id', agent_name: 'WorkforceCurriculumDirector', record_kind: 'behavior',
        description: 'Flags curriculum gaps daily.', trigger_type: 'cron', schedule: '10 6 * * *',
        enabled: true, migration_status: 'absorbed',
      };
      mockAgentFindAll.mockResolvedValue([ownedRow]);

      const result = await getAgentDetail('agent-1');

      expect(mockAgentFindAll).toHaveBeenCalledWith({
        where: { parent_agent_id: 'agent-1' },
        order: [['agent_name', 'ASC']],
      });
      expect(result!.owned_behaviors).toEqual([
        {
          id: 'director-id', agent_name: 'WorkforceCurriculumDirector', record_kind: 'behavior',
          description: 'Flags curriculum gaps daily.', trigger_type: 'cron', schedule: '10 6 * * *',
          enabled: true, migration_status: 'absorbed',
        },
      ]);
    });

    it("honesty boundary: [] when nothing has been absorbed under this agent yet (the entire fleet on day one except Dara) — never gated on module, unlike related_tasks", async () => {
      const result = await getAgentDetail('agent-1');

      expect(result!.owned_behaviors).toEqual([]);
    });

    it('honesty path: record_kind and migration_status read null honestly for a row the program has not classified, never a fabricated default', async () => {
      mockAgentFindAll.mockResolvedValue([{
        id: 'unclassified-id', agent_name: 'SomeUnclassifiedAgent', record_kind: null,
        description: null, trigger_type: null, schedule: null, enabled: true, migration_status: null,
      }]);

      const result = await getAgentDetail('agent-1');

      expect(result!.owned_behaviors[0].record_kind).toBeNull();
      expect(result!.owned_behaviors[0].migration_status).toBeNull();
    });
  });

  it("ticket.description passes through verbatim — the real 'why' narrative already written at ticket-creation time, never truncated or omitted", async () => {
    mockTicketFindAll.mockResolvedValue([
      {
        id: 't1', ticket_number: 1, title: 'Reese autonomous outreach — inactivity (Jane Doe)',
        description: 'Reese is proactively reaching out to Jane Doe. Signal: inactivity. Goal: Confirm the student is unblocked and re-engaged with the curriculum within 7 days.',
        status: 'in_progress', priority: 'medium', type: 'reese_autonomous_outreach', created_at: new Date(), updated_at: new Date(),
      },
    ]);

    const result = await getAgentDetail('agent-1');

    expect(result!.tickets[0].description).toBe(
      'Reese is proactively reaching out to Jane Doe. Signal: inactivity. Goal: Confirm the student is unblocked and re-engaged with the curriculum within 7 days.',
    );
  });

  // Dashboard redesign, Slice 2a (2026-09-19) — the Work tab's honest
  // status filter. due_date is a real column, previously fetched but never
  // surfaced; status_bucket is derived from real fields, no schema change.
  describe('tickets: due_date / status_bucket (Slice 2a)', () => {
    it('due_date passes through verbatim, and null when the ticket genuinely has none', async () => {
      const due = new Date('2026-09-01T00:00:00Z');
      mockTicketFindAll.mockResolvedValue([
        { id: 't1', ticket_number: 1, title: 'Has a due date', status: 'todo', priority: 'medium', type: 'student_support', created_at: new Date(), updated_at: new Date(), due_date: due },
        { id: 't2', ticket_number: 2, title: 'No due date', status: 'todo', priority: 'medium', type: 'student_support', created_at: new Date(), updated_at: new Date(), due_date: null },
      ]);

      const result = await getAgentDetail('agent-1');

      expect(result!.tickets[0].due_date).toEqual(due);
      expect(result!.tickets[1].due_date).toBeNull();
    });

    it("status_bucket: 'overdue' when due_date is past and status is non-terminal, taking priority over the agent's own latest activity", async () => {
      mockTicketFindAll.mockResolvedValue([
        { id: 't1', ticket_number: 1, title: 'Overdue', status: 'in_progress', priority: 'medium', type: 'student_support', created_at: new Date(), updated_at: new Date(), due_date: new Date('2020-01-01T00:00:00Z') },
      ]);
      mockTicketActivityFindAll.mockResolvedValue([
        { ticket_id: 't1', actor_id: 'admin-1', created_at: new Date('2026-09-01T00:00:00Z') }, // Reese's own latest activity
      ]);

      const result = await getAgentDetail('agent-1');

      expect(result!.tickets[0].status_bucket).toBe('overdue');
    });

    it("status_bucket: 'ready_to_verify' for a non-overdue in_review ticket", async () => {
      mockTicketFindAll.mockResolvedValue([
        { id: 't1', ticket_number: 1, title: 'In review', status: 'in_review', priority: 'medium', type: 'student_support', created_at: new Date(), updated_at: new Date(), due_date: null },
      ]);

      const result = await getAgentDetail('agent-1');

      expect(result!.tickets[0].status_bucket).toBe('ready_to_verify');
    });

    it("status_bucket: 'needs_reply' when the most recent TicketActivity actor is NOT this agent's own identity", async () => {
      mockTicketFindAll.mockResolvedValue([
        { id: 't1', ticket_number: 1, title: 'Student replied', status: 'in_progress', priority: 'medium', type: 'student_support', created_at: new Date(), updated_at: new Date(), due_date: null },
      ]);
      mockTicketActivityFindAll.mockResolvedValue([
        { ticket_id: 't1', actor_id: 'some-student-id', created_at: new Date('2026-09-15T00:00:00Z') },
      ]);

      const result = await getAgentDetail('agent-1');

      expect(mockTicketActivityFindAll).toHaveBeenCalledWith(expect.objectContaining({
        where: { ticket_id: { [Op.in]: ['t1'] } },
      }));
      expect(result!.tickets[0].status_bucket).toBe('needs_reply');
    });

    it("status_bucket: 'open' when the latest activity IS this agent's own — never a fabricated needs_reply", async () => {
      mockTicketFindAll.mockResolvedValue([
        { id: 't1', ticket_number: 1, title: 'Reese replied last', status: 'in_progress', priority: 'medium', type: 'student_support', created_at: new Date(), updated_at: new Date(), due_date: null },
      ]);
      mockTicketActivityFindAll.mockResolvedValue([
        { ticket_id: 't1', actor_id: 'admin-1', created_at: new Date('2026-09-15T00:00:00Z') },
      ]);

      const result = await getAgentDetail('agent-1');

      expect(result!.tickets[0].status_bucket).toBe('open');
    });

    it("status_bucket: 'open' for a ticket with zero activity rows — never a fabricated needs_reply", async () => {
      mockTicketFindAll.mockResolvedValue([
        { id: 't1', ticket_number: 1, title: 'No activity yet', status: 'todo', priority: 'medium', type: 'student_support', created_at: new Date(), updated_at: new Date(), due_date: null },
      ]);
      mockTicketActivityFindAll.mockResolvedValue([]);

      const result = await getAgentDetail('agent-1');

      expect(result!.tickets[0].status_bucket).toBe('open');
    });

    it("status_bucket: null for a terminal (done/cancelled) ticket — never a fabricated 'open' or 'needs_reply' on a closed ticket, even with a past due_date and a non-agent latest activity", async () => {
      mockTicketFindAll.mockResolvedValue([
        { id: 't1', ticket_number: 1, title: 'Closed', status: 'done', priority: 'medium', type: 'student_support', created_at: new Date(), updated_at: new Date(), due_date: new Date('2020-01-01T00:00:00Z') },
      ]);
      mockTicketActivityFindAll.mockResolvedValue([
        { ticket_id: 't1', actor_id: 'some-student-id', created_at: new Date('2026-09-15T00:00:00Z') },
      ]);

      const result = await getAgentDetail('agent-1');

      expect(result!.tickets[0].status_bucket).toBeNull();
    });

    it('TicketActivity.findAll is skipped entirely when there are no tickets — no unbounded/empty-array query', async () => {
      mockTicketFindAll.mockResolvedValue([]);

      await getAgentDetail('agent-1');

      expect(mockTicketActivityFindAll).not.toHaveBeenCalled();
    });

    it('groups multiple activity rows per ticket correctly, taking only the latest per ticket_id from a mixed multi-ticket result set', async () => {
      mockTicketFindAll.mockResolvedValue([
        { id: 't1', ticket_number: 1, title: 'Ticket 1', status: 'todo', priority: 'medium', type: 'student_support', created_at: new Date(), updated_at: new Date(), due_date: null },
        { id: 't2', ticket_number: 2, title: 'Ticket 2', status: 'todo', priority: 'medium', type: 'student_support', created_at: new Date(), updated_at: new Date(), due_date: null },
      ]);
      mockTicketActivityFindAll.mockResolvedValue([
        { ticket_id: 't1', actor_id: 'some-student-id', created_at: new Date('2026-09-15T00:00:00Z') }, // t1's latest
        { ticket_id: 't1', actor_id: 'admin-1', created_at: new Date('2026-09-01T00:00:00Z') }, // t1's older, Reese's own
        { ticket_id: 't2', actor_id: 'admin-1', created_at: new Date('2026-09-10T00:00:00Z') }, // t2's only/latest, Reese's own
      ]);

      const result = await getAgentDetail('agent-1');

      const byId = Object.fromEntries(result!.tickets.map((t) => [t.id, t.status_bucket]));
      expect(byId.t1).toBe('needs_reply'); // latest was the student, not Reese
      expect(byId.t2).toBe('open'); // latest was Reese's own
    });
  });

  // Trust Contract Phase 1 (2026-08-26) — real version history, real cost,
  // real authorization verdicts, all keyed on the real AiAgent id.
  describe('persona_version_history / cost_summary / authorization_summary', () => {
    it('happy path: passes through real history rows verbatim, keyed on the real agent id', async () => {
      const rows = [{ id: 'h1', persona_version: '2026-09-01', previous_version: '2026-08-06', source: 'registry_seed', created_at: new Date() }];
      mockPersonaHistory.mockResolvedValue(rows);

      const result = await getAgentDetail('agent-1');

      expect(result!.persona_version_history).toEqual(rows);
      expect(mockPersonaHistory).toHaveBeenCalledWith('agent-1');
    });

    it('honesty boundary: [] when this agent\'s persona_version has never changed, never fabricated history', async () => {
      mockPersonaHistory.mockResolvedValue([]);

      const result = await getAgentDetail('agent-1');

      expect(result!.persona_version_history).toEqual([]);
    });

    it('cost_summary: reflects the real per-agent row from the shared trustMetricsService query', async () => {
      mockCostRows.mockResolvedValue([{ agentId: 'agent-1', costUsd: 4.82, runs: 37 }]);

      const result = await getAgentDetail('agent-1');

      expect(result!.cost_summary).toEqual({ cost_usd: 4.82, runs: 37 });
      expect(mockCostRows).toHaveBeenCalledWith(30, 'agent-1');
    });

    it('cost_summary: null when this agent has zero cost-tracked events in the window, never a fabricated $0 row', async () => {
      mockCostRows.mockResolvedValue([]);

      const result = await getAgentDetail('agent-1');

      expect(result!.cost_summary).toBeNull();
    });

    it('authorization_summary: passes through the real per-agent verdict breakdown verbatim', async () => {
      const summary = { window_days: 30, total: 18, allow: 14, approval: 3, block: 1, enforced_count: 2 };
      mockAuthSummary.mockResolvedValue(summary);

      const result = await getAgentDetail('agent-1');

      expect(result!.authorization_summary).toEqual(summary);
      expect(mockAuthSummary).toHaveBeenCalledWith('agent-1', 'Reese', 30);
    });

    it('these 3 fields key on the real AiAgent id directly, independent of whether a linked AdminUser identity exists', async () => {
      mockAdminFindOne.mockResolvedValue(null); // no linked staff identity — tickets/capabilities go empty, but these 3 must not

      const result = await getAgentDetail('agent-1');

      expect(mockPersonaHistory).toHaveBeenCalledWith('agent-1');
      expect(mockCostRows).toHaveBeenCalledWith(30, 'agent-1');
      expect(mockAuthSummary).toHaveBeenCalledWith('agent-1', 'Reese', 30);
    });
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

    describe('goals (Checkpoint E — Trust Before Intelligence Workspace)', () => {
      it('happy path: real goals/goals_overall from computeAgentGoalsDimensions are passed through unchanged', async () => {
        const realGoals = [{ key: 'governance', label: 'Governance', score: 5, source: 'fixed', evidence: 'Tier write_with_audit.' }];
        mockGoalsDimensions.mockResolvedValue({ goals: realGoals, goalsOverall: 4.2 });

        const result = await getAgentDetail('agent-1');

        expect(mockGoalsDimensions).toHaveBeenCalledWith(reeseAgent);
        expect(result!.goals).toEqual(realGoals);
        expect(result!.goals_overall).toBe(4.2);
      });
    });

    describe('employee_facts (Reese Product Phase 1, R7 — truthful employee facts)', () => {
      it('honesty boundary: null for every agent that is not Reese — no fabricated availability/work-state for an agent this phase never reviewed', async () => {
        mockAgentFindByPk.mockResolvedValue({ ...reeseAgent, agent_name: 'CoryBrain' });

        const result = await getAgentDetail('agent-1');

        expect(result!.employee_facts).toBeNull();
        expect(mockRoomMessageFindOne).not.toHaveBeenCalled();
        expect(mockGetRoleCharter).not.toHaveBeenCalled();
      });

      it('happy path: real charter version/effective date, real last meaningful action, real manager chain, real behaviour switches', async () => {
        mockGetRoleCharter.mockResolvedValue({
          agentId: 'agent-1',
          charter: { version: 2, effectiveAt: new Date('2026-09-18T00:00:00Z') },
        });
        mockRoomMessageFindOne.mockResolvedValue({ created_at: new Date('2026-09-18T10:00:00Z'), content: 'Here is your next move.' });
        mockLastActivity.mockResolvedValue(new Date('2026-09-17T09:00:00Z')); // older than the room message
        mockResolveChain.mockResolvedValue({ resolvedHumanId: 'org-member-ali', trail: ['Reese (human) -> Ali'] });
        mockOrgMemberFindByPk.mockResolvedValue({ id: 'org-member-ali', email: 'ali@colaberry.com', enrollment_id: 'enrollment-ali' });
        mockEnrollmentFindByPk.mockResolvedValue({ full_name: 'Ali Muwwakkil' });
        const reeseWithHumanManager = { ...reeseAgent, reports_to_type: 'human', reports_to_id: 'org-member-ali' };
        mockAgentFindByPk.mockResolvedValue(reeseWithHumanManager);
        mockCountOpenTickets.mockResolvedValue(2);

        const result = await getAgentDetail('agent-1');
        const facts = result!.employee_facts!;

        expect(facts.charter_version).toBe(2);
        expect(facts.charter_effective_at).toEqual(new Date('2026-09-18T00:00:00Z'));
        expect(facts.manager_chain_note).toBe('Reports to: Ali Muwwakkil');
        expect(facts.last_meaningful_action).toEqual({ at: new Date('2026-09-18T10:00:00Z'), description: 'Sent a DM: "Here is your next move."' });
        expect(facts.work_state).toBe('working_on_ticket');
        expect(facts.work_state_detail).toBe('2 open ticket(s)');
        expect(facts.availability).toBe('available');
      });

      it('honesty boundary: no charter, no room message, no ticket activity, no manager chain — every field is honestly null/idle, never fabricated', async () => {
        mockGetRoleCharter.mockResolvedValue({ agentId: 'agent-1', charter: null });
        mockRoomMessageFindOne.mockResolvedValue(null);
        mockLastActivity.mockResolvedValue(null);
        mockCountOpenTickets.mockResolvedValue(0);

        const result = await getAgentDetail('agent-1');
        const facts = result!.employee_facts!;

        expect(facts.charter_version).toBeNull();
        expect(facts.charter_effective_at).toBeNull();
        expect(facts.last_meaningful_action).toBeNull();
        expect(facts.work_state).toBe('idle');
        expect(facts.manager_chain_note).toBe('No manager chain configured');
      });

      it('picks the ticket activity over the room message when the ticket is more recent', async () => {
        mockRoomMessageFindOne.mockResolvedValue({ created_at: new Date('2026-09-10T00:00:00Z'), content: 'old message' });
        mockLastActivity.mockResolvedValue(new Date('2026-09-17T00:00:00Z'));

        const result = await getAgentDetail('agent-1');

        expect(result!.employee_facts!.last_meaningful_action!.at).toEqual(new Date('2026-09-17T00:00:00Z'));
      });

      it('availability: unavailable when Reese\'s own row is disabled, even if a cron behaviour row is still enabled', async () => {
        mockAgentFindByPk.mockResolvedValue({ ...reeseAgent, enabled: false, module: 'reese' });
        mockAgentFindAll.mockResolvedValue([{ agent_name: 'ReeseAutonomousOutreachSweep', enabled: true }]);

        const result = await getAgentDetail('agent-1');

        expect(result!.employee_facts!.availability).toBe('unavailable');
      });

      it('behaviours: reflects the real registry-row enabled flags for the cron-gated behaviours, via the same relatedTaskRows already fetched', async () => {
        mockAgentFindByPk.mockResolvedValue({ ...reeseAgent, module: 'reese' });
        mockAgentFindAll.mockResolvedValue([
          { agent_name: 'ReeseAutonomousOutreachSweep', enabled: true },
          { agent_name: 'ReeseOutreachFollowUps', enabled: false },
          { agent_name: 'ReesePresenceHeartbeat', enabled: true },
          { agent_name: 'ReeseStudentSupportSupersessionResolver', enabled: false },
        ]);

        const result = await getAgentDetail('agent-1');
        const byName = Object.fromEntries(result!.employee_facts!.behaviours.map((b) => [b.name, b.enabled]));

        expect(byName['Autonomous outreach sweep']).toBe(true);
        expect(byName['Outreach follow-ups']).toBe(false);
        expect(byName['Presence heartbeat']).toBe(true);
        expect(byName['Student support supersession resolver']).toBe(false);
        expect(byName['Reactive DM reply']).toBe(true); // agent.enabled, not registry-gated
      });

      // R9 (2026-09-18) — Ali, live: "I'd also like to see a link to the
      // last ticket or time this process run." Wires computeLastTicketPerBehaviour()
      // end to end, into both employee_facts.behaviours and related_tasks.
      it('last_ticket: the real most recent ticket flows through to both employee_facts.behaviours and related_tasks, keyed by real type', async () => {
        mockAgentFindByPk.mockResolvedValue({ ...reeseAgent, module: 'reese' });
        mockAgentFindAll.mockResolvedValue([
          { id: 'sweep-row', agent_name: 'ReeseAutonomousOutreachSweep', enabled: true },
        ]);
        mockTicketFindAll.mockResolvedValue([
          { id: 'support-1', ticket_number: 5, title: 'Older support', status: 'in_progress', type: 'student_support', updated_at: new Date('2026-09-01T00:00:00Z') },
          { id: 'support-2', ticket_number: 6, title: 'Newer support', status: 'in_progress', type: 'student_support', updated_at: new Date('2026-09-10T00:00:00Z') },
          { id: 'outreach-1', ticket_number: 7, title: 'Outreach signal', status: 'todo', type: 'reese_autonomous_outreach', updated_at: new Date('2026-09-05T00:00:00Z') },
        ]);

        const result = await getAgentDetail('agent-1');
        const byKey = Object.fromEntries(result!.employee_facts!.behaviours.map((b) => [b.key, b.last_ticket]));

        expect(byKey.reactive_dm_reply).toEqual({ id: 'support-2', ticket_number: 6, title: 'Newer support', at: new Date('2026-09-10T00:00:00Z') });
        expect(byKey.autonomous_outreach_sweep).toEqual({ id: 'outreach-1', ticket_number: 7, title: 'Outreach signal', at: new Date('2026-09-05T00:00:00Z') });
        expect(byKey.welcome_dms).toBeNull();

        const sweepTask = result!.related_tasks.find((t) => t.agent_name === 'ReeseAutonomousOutreachSweep');
        expect(sweepTask!.last_ticket).toEqual({ id: 'outreach-1', ticket_number: 7, title: 'Outreach signal', at: new Date('2026-09-05T00:00:00Z') });
      });

      // Phase 1 workspace mission, R11 (2026-09-18) — "Show whether each
      // action is model-selected, rule-triggered, or human-directed. Show
      // callable, configured, authorized, enabled, and healthy as distinct
      // facts."
      it('trigger_mode and status facts: real per-behaviour classification, and healthy is honestly null for non-cron-tracked behaviours', async () => {
        mockAgentFindByPk.mockResolvedValue({ ...reeseAgent, module: 'reese' });
        mockAgentFindAll.mockResolvedValue([
          { id: 'sweep-row', agent_name: 'ReeseAutonomousOutreachSweep', enabled: true, run_count: 20, error_count: 0 },
          { id: 'heartbeat-row', agent_name: 'ReesePresenceHeartbeat', enabled: true, run_count: 500, error_count: 4 },
        ]);

        const result = await getAgentDetail('agent-1');
        const byKey = Object.fromEntries(result!.employee_facts!.behaviours.map((b) => [b.key, b]));

        expect(byKey.reactive_dm_reply.trigger_mode).toBe('model_selected');
        expect(byKey.autonomous_outreach_sweep.trigger_mode).toBe('rule_triggered');
        expect(byKey.autonomous_outreach_sweep.status.healthy).toBe(true);
        expect(byKey.presence_heartbeat.status.healthy).toBe(false);
        // reactive_dm_reply has no per-behaviour run tracking -- honest null,
        // never a fabricated true/false.
        expect(byKey.reactive_dm_reply.status.healthy).toBeNull();
        expect(byKey.reactive_dm_reply.status.callable).toBe(true);
      });
    });
  });
});
