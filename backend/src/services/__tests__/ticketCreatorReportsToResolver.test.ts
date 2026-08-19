/**
 * Agent Ticket Standard resolver — the split proven necessary by plan-audit
 * cycle 1 (session CC-20260818-x4nk): 'agent'/'cory' creators pass an agent_name
 * string directly, but 'ai_staff' creators pass an AdminUser id and must be
 * resolved via AdminUser.agent_id first. Reese's real production id
 * (82c2dfd2-369e-4545-8d2f-22d1ae3451ff, confirmed against
 * resolveActorDisplayName.test.ts's own REESE_ADMIN_ID fixture and live
 * production data) is used as the ai_staff fixture throughout.
 */
jest.mock('../../models/AdminUser', () => ({ findByPk: jest.fn() }));
jest.mock('../../models/AiAgent', () => ({ findOne: jest.fn(), findByPk: jest.fn() }));

import AdminUser from '../../models/AdminUser';
import AiAgent from '../../models/AiAgent';
import {
  resolveCreatorAiAgent,
  enforceReportsToGate,
  resolveReportsToHuman,
  resolveReportsToChainWithTrail,
} from '../ticketCreatorReportsToResolver';
import { TicketCreatorNotReportableError } from '../errors/ticketCreatorErrors';

const mockAdminFindByPk = AdminUser.findByPk as unknown as jest.Mock;
const mockAgentFindOne = AiAgent.findOne as unknown as jest.Mock;
const mockAgentFindByPk = AiAgent.findByPk as unknown as jest.Mock;

const REESE_ADMIN_ID = '82c2dfd2-369e-4545-8d2f-22d1ae3451ff';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveCreatorAiAgent', () => {
  it("'agent': resolves directly by agent_name, never touches AdminUser", async () => {
    const agentRow = { id: 'a1', agent_name: 'AlumniNetworkArchitect', reports_to_org_member_id: 'jackie-id' };
    mockAgentFindOne.mockResolvedValue(agentRow);

    const result = await resolveCreatorAiAgent('agent', 'AlumniNetworkArchitect');

    expect(result).toBe(agentRow);
    expect(mockAgentFindOne).toHaveBeenCalledWith({ where: { agent_name: 'AlumniNetworkArchitect' } });
    expect(mockAdminFindByPk).not.toHaveBeenCalled();
  });

  it("'cory': resolves directly by agent_name (same path as 'agent')", async () => {
    const agentRow = { id: 'a2', agent_name: 'CoryBrain', reports_to_org_member_id: 'ali-id' };
    mockAgentFindOne.mockResolvedValue(agentRow);

    const result = await resolveCreatorAiAgent('cory', 'CoryBrain');

    expect(result).toBe(agentRow);
    expect(mockAgentFindOne).toHaveBeenCalledWith({ where: { agent_name: 'CoryBrain' } });
  });

  it("'ai_staff': resolves via AdminUser.agent_id -> AiAgent — Reese's real shape (the plan-audit cycle 1 regression case)", async () => {
    mockAdminFindByPk.mockResolvedValue({ agent_id: 'reese-aiagent-id' });
    const agentRow = { id: 'reese-aiagent-id', agent_name: 'Reese', reports_to_org_member_id: 'taiwo-id' };
    mockAgentFindByPk.mockResolvedValue(agentRow);

    const result = await resolveCreatorAiAgent('ai_staff', REESE_ADMIN_ID);

    expect(result).toBe(agentRow);
    expect(mockAdminFindByPk).toHaveBeenCalledWith(REESE_ADMIN_ID, { attributes: ['agent_id'] });
    expect(mockAgentFindByPk).toHaveBeenCalledWith('reese-aiagent-id');
    // Never tried the agent_name path for an ai_staff creator.
    expect(mockAgentFindOne).not.toHaveBeenCalled();
  });

  it("'ai_staff': no matching AdminUser row -> null, never throws", async () => {
    mockAdminFindByPk.mockResolvedValue(null);

    const result = await resolveCreatorAiAgent('ai_staff', 'nonexistent-admin-id');

    expect(result).toBeNull();
    expect(mockAgentFindByPk).not.toHaveBeenCalled();
  });

  it("'ai_staff': AdminUser exists but has no linked agent_id -> null", async () => {
    mockAdminFindByPk.mockResolvedValue({ agent_id: null });

    const result = await resolveCreatorAiAgent('ai_staff', 'some-admin-id');

    expect(result).toBeNull();
    expect(mockAgentFindByPk).not.toHaveBeenCalled();
  });

  it("'agent': an unregistered agent_name resolves to null", async () => {
    mockAgentFindOne.mockResolvedValue(null);

    const result = await resolveCreatorAiAgent('agent', 'CoryAgenticEngine');

    expect(result).toBeNull();
  });

  it("'human': always resolves to null without querying anything — createTicket() bypasses this resolver for human creators, but the resolver itself is a safe no-op if ever called with 'human'", async () => {
    const result = await resolveCreatorAiAgent('human', 'any-id');

    expect(result).toBeNull();
    expect(mockAgentFindOne).not.toHaveBeenCalled();
    expect(mockAdminFindByPk).not.toHaveBeenCalled();
  });
});

// AI Leadership / AI Staff hierarchy (Ali, live, 2026-08-19). resolveReportsToHuman()
// walks reports_to_type/reports_to_id — either straight to a human (AI Leadership)
// or through one or more agent hops (AI Staff) — with a MAX_CHAIN_DEPTH cycle guard.
describe('resolveReportsToHuman', () => {
  it('AI Leadership: reports_to_type human resolves directly, zero extra lookups', async () => {
    const agent = { reports_to_type: 'human', reports_to_id: 'ali-org-member-id' } as any;

    const result = await resolveReportsToHuman(agent);

    expect(result).toBe('ali-org-member-id');
    expect(mockAgentFindByPk).not.toHaveBeenCalled();
  });

  it('AI Staff: one hop through an AI Leadership agent to a human', async () => {
    const staffAgent = { agent_name: 'StudentSuccessArchitect', reports_to_type: 'agent', reports_to_id: 'corybrain-id' } as any;
    const leadershipAgent = { agent_name: 'CoryBrain', reports_to_type: 'human', reports_to_id: 'ali-org-member-id' };
    mockAgentFindByPk.mockResolvedValueOnce(leadershipAgent);

    const result = await resolveReportsToHuman(staffAgent);

    expect(result).toBe('ali-org-member-id');
    expect(mockAgentFindByPk).toHaveBeenCalledWith('corybrain-id');
  });

  it('unset reports_to (neither type nor id) resolves to null', async () => {
    const agent = { reports_to_type: null, reports_to_id: null } as any;

    const result = await resolveReportsToHuman(agent);

    expect(result).toBeNull();
    expect(mockAgentFindByPk).not.toHaveBeenCalled();
  });

  it('AI Staff pointing at a non-existent agent (dangling reports_to_id) resolves to null, does not throw', async () => {
    const staffAgent = { agent_name: 'OrphanedAgent', reports_to_type: 'agent', reports_to_id: 'nonexistent-id' } as any;
    mockAgentFindByPk.mockResolvedValueOnce(null);

    const result = await resolveReportsToHuman(staffAgent);

    expect(result).toBeNull();
  });

  it('a cycle (A -> B -> A) is bounded by MAX_CHAIN_DEPTH and resolves to null, never loops forever', async () => {
    const agentA = { agent_name: 'A', reports_to_type: 'agent', reports_to_id: 'b-id' } as any;
    const agentB = { agent_name: 'B', reports_to_type: 'agent', reports_to_id: 'a-id' };
    // Every hop returns the other agent, forever — the depth guard must stop this,
    // not the mock running out (mockResolvedValue, not mockResolvedValueOnce, is
    // deliberate here: proves the guard itself bounds the recursion).
    mockAgentFindByPk.mockImplementation((id: string) => Promise.resolve(id === 'b-id' ? agentB : agentA));

    const result = await resolveReportsToHuman(agentA);

    expect(result).toBeNull();
    // MAX_CHAIN_DEPTH is 5 — confirms it actually stopped, not an unbounded loop
    // that happened to return before the test timed out.
    expect(mockAgentFindByPk.mock.calls.length).toBeLessThanOrEqual(5);
  });
});

// Org-chart hierarchy build (2026-08-19) — resolveReportsToHuman() above is
// now a thin wrapper over this trail-returning function; these tests cover
// the trail shape directly (AgentDetailPage's "Reports to" section consumes
// it), while resolveReportsToHuman()'s own tests above (unmodified, still
// passing) prove the wrapper's resolvedHumanId output is unaffected by the
// refactor.
describe('resolveReportsToChainWithTrail', () => {
  it('AI Leadership (0-hop): trail has exactly 1 entry ending in [human]', async () => {
    const agent = { agent_name: 'CoryBrain', reports_to_type: 'human', reports_to_id: 'ali-org-member-id' } as any;

    const result = await resolveReportsToChainWithTrail(agent);

    expect(result.resolvedHumanId).toBe('ali-org-member-id');
    expect(result.trail).toEqual(['CoryBrain (agent) -> [human]']);
  });

  it('AI Staff (1-hop through AI Leadership): trail has 2 entries, the first bare, the second ending in [human]', async () => {
    const staffAgent = { agent_name: 'AdmissionsConversionArchitect', reports_to_type: 'agent', reports_to_id: 'corybrain-id' } as any;
    const leadershipAgent = { agent_name: 'CoryBrain', reports_to_type: 'human', reports_to_id: 'ali-org-member-id' };
    mockAgentFindByPk.mockResolvedValueOnce(leadershipAgent);

    const result = await resolveReportsToChainWithTrail(staffAgent);

    expect(result.resolvedHumanId).toBe('ali-org-member-id');
    expect(result.trail).toEqual(['AdmissionsConversionArchitect (agent)', 'CoryBrain (agent) -> [human]']);
  });

  it('failure: a dangling reports_to_id ends the trail in [dangling], resolvedHumanId null', async () => {
    const staffAgent = { agent_name: 'OrphanedAgent', reports_to_type: 'agent', reports_to_id: 'nonexistent-id' } as any;
    mockAgentFindByPk.mockResolvedValueOnce(null);

    const result = await resolveReportsToChainWithTrail(staffAgent);

    expect(result.resolvedHumanId).toBeNull();
    expect(result.trail).toEqual(['OrphanedAgent (agent) -> [dangling]']);
  });

  it('boundary: unset reports_to (neither type nor id) ends the trail in [unset]', async () => {
    const agent = { agent_name: 'SomeFutureAgent', reports_to_type: null, reports_to_id: null } as any;

    const result = await resolveReportsToChainWithTrail(agent);

    expect(result.resolvedHumanId).toBeNull();
    expect(result.trail).toEqual(['SomeFutureAgent (agent) -> [unset]']);
  });

  it('a cycle (A -> B -> A) is bounded by MAX_CHAIN_DEPTH: trail stops growing, resolvedHumanId null, never loops forever', async () => {
    const agentA = { agent_name: 'A', reports_to_type: 'agent', reports_to_id: 'b-id' } as any;
    const agentB = { agent_name: 'B', reports_to_type: 'agent', reports_to_id: 'a-id' };
    mockAgentFindByPk.mockImplementation((id: string) => Promise.resolve(id === 'b-id' ? agentB : agentA));

    const result = await resolveReportsToChainWithTrail(agentA);

    expect(result.resolvedHumanId).toBeNull();
    // MAX_CHAIN_DEPTH is 5 — the trail has at most 5 entries, confirming the
    // guard actually stopped it rather than the mock happening to end early.
    expect(result.trail.length).toBeLessThanOrEqual(5);
    expect(mockAgentFindByPk.mock.calls.length).toBeLessThanOrEqual(5);
  });

  // Idempotency: a pure function over immutable input with no side effect —
  // calling it twice with the same agent must return deep-equal results. Not
  // a vacuous test: the recursive `trail` accumulation uses array spreads
  // (`[...trail, ...]`), so this also guards against a future edit
  // accidentally mutating/sharing the trail array across calls.
  it('idempotency: calling twice with the same agent returns deep-equal results, no shared-array mutation', async () => {
    const staffAgent = { agent_name: 'AdmissionsConversionArchitect', reports_to_type: 'agent', reports_to_id: 'corybrain-id' } as any;
    const leadershipAgent = { agent_name: 'CoryBrain', reports_to_type: 'human', reports_to_id: 'ali-org-member-id' };
    mockAgentFindByPk.mockResolvedValue(leadershipAgent);

    const first = await resolveReportsToChainWithTrail(staffAgent);
    const second = await resolveReportsToChainWithTrail(staffAgent);

    expect(second).toEqual(first);
    expect(second.trail).not.toBe(first.trail); // distinct array instances, not a shared reference
  });
});

// Agent Ticket Standard's actual gate (extracted out of ticketService.createTicket()
// for CLAUDE.md's file-size ceiling — see ticketService.ts's own header comment).
describe('enforceReportsToGate', () => {
  it("'human': bypasses entirely, returns null, queries nothing", async () => {
    const result = await enforceReportsToGate('human', 'any-admin-uuid-or-string');

    expect(result).toBeNull();
    expect(mockAgentFindOne).not.toHaveBeenCalled();
    expect(mockAdminFindByPk).not.toHaveBeenCalled();
  });

  it('happy path (AI Leadership): a registered agent with reports_to_type=human resolves directly', async () => {
    mockAgentFindOne.mockResolvedValue({ reports_to_type: 'human', reports_to_id: 'jackie-id' });

    const result = await enforceReportsToGate('agent', 'AlumniNetworkArchitect');

    expect(result).toBe('jackie-id');
  });

  it('happy path (AI Staff): resolves through one AI Leadership hop to a human', async () => {
    mockAgentFindOne.mockResolvedValue({
      agent_name: 'AdmissionsConversionArchitect',
      reports_to_type: 'agent',
      reports_to_id: 'corybrain-id',
    });
    mockAgentFindByPk.mockResolvedValueOnce({
      agent_name: 'CoryBrain',
      reports_to_type: 'human',
      reports_to_id: 'ali-org-member-id',
    });

    const result = await enforceReportsToGate('agent', 'AdmissionsConversionArchitect');

    expect(result).toBe('ali-org-member-id');
  });

  it("happy path (ai_staff creator type): Reese's real shape (AdminUser id -> agent_id -> AiAgent), now AI Staff reporting through workforce_intelligence_engine — the regression case for plan-audit cycle 1's finding, extended for the 2-tier hierarchy", async () => {
    mockAdminFindByPk.mockResolvedValue({ agent_id: 'reese-aiagent-id' });
    mockAgentFindByPk
      .mockResolvedValueOnce({
        agent_name: 'Reese',
        reports_to_type: 'agent',
        reports_to_id: 'wie-id',
      })
      .mockResolvedValueOnce({
        agent_name: 'workforce_intelligence_engine',
        reports_to_type: 'human',
        reports_to_id: 'kes-id',
      });

    const result = await enforceReportsToGate('ai_staff', REESE_ADMIN_ID);

    expect(result).toBe('kes-id');
  });

  it('failure path: an unregistered creator throws TicketCreatorNotReportableError BEFORE any caller could write, reason unregistered', async () => {
    mockAgentFindOne.mockResolvedValue(null);

    await expect(enforceReportsToGate('agent', 'CoryAgenticEngine')).rejects.toMatchObject({
      error_class: 'TicketCreatorNotReportableError',
      context: { createdByType: 'agent', createdById: 'CoryAgenticEngine', reason: 'unregistered' },
    });
    await expect(enforceReportsToGate('agent', 'CoryAgenticEngine')).rejects.toBeInstanceOf(
      TicketCreatorNotReportableError,
    );
  });

  it('failure path: a registered agent with no reports_to_type/reports_to_id set throws, reason no_reports_to', async () => {
    mockAgentFindOne.mockResolvedValue({ reports_to_type: null, reports_to_id: null });

    await expect(enforceReportsToGate('agent', 'SomeFutureAgent')).rejects.toMatchObject({
      error_class: 'TicketCreatorNotReportableError',
      context: { reason: 'no_reports_to' },
    });
  });

  it('failure path: an AI Staff agent whose leadership target is dangling throws, reason no_reports_to', async () => {
    mockAgentFindOne.mockResolvedValue({
      agent_name: 'OrphanedStaffAgent',
      reports_to_type: 'agent',
      reports_to_id: 'nonexistent-leadership-id',
    });
    mockAgentFindByPk.mockResolvedValueOnce(null);

    await expect(enforceReportsToGate('agent', 'OrphanedStaffAgent')).rejects.toMatchObject({
      error_class: 'TicketCreatorNotReportableError',
      context: { reason: 'no_reports_to' },
    });
  });
});
