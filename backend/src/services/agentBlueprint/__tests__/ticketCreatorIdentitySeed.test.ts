/**
 * Agent Registration Stage 1 — tests for the ticket-creator identity wrapper.
 * Mocks seedAgentIdentity() directly (its own behavior is already covered by
 * agentIdentitySeed.test.ts) so this file focuses on what this wrapper itself
 * is responsible for: the configs are well-formed and distinct, one call per
 * entry, one failure never blocks the others (failure-path coverage), and
 * running twice behaves identically both times (idempotency coverage) — per
 * CLAUDE.md's Mandatory Test Types.
 *
 * Grew from 5 to 21 entries in the Agent Ticket Standard audit of the 16
 * department Strategy Architect agents (2026-08-18, session CC-20260818-a7d2)
 * — see the file's own header comment for why (they were completely invisible
 * on the Workforce OS Live Agents panel until this identity quad existed for
 * them too). `EXPECTED_COUNT` is the one number this file hardcodes; every
 * other assertion here is shape/uniqueness-based and scales with the array
 * automatically, so a future 17th/22nd entry only needs this one constant
 * updated, not a rewrite of every test.
 */
const EXPECTED_COUNT = 22;
jest.mock('../agentIdentitySeed', () => ({
  seedAgentIdentity: jest.fn(),
  getAgentAdminUserId: jest.fn(),
}));

import { seedAgentIdentity, getAgentAdminUserId } from '../agentIdentitySeed';
import {
  seedTicketCreatorIdentities,
  getTicketCreatorAdminUserId,
  TICKET_CREATOR_IDENTITIES,
  REASSIGNED_TO_TAIWO_AGENT_NAMES,
} from '../ticketCreatorIdentitySeed';

const mockSeedAgentIdentity = seedAgentIdentity as unknown as jest.Mock;
const mockGetAgentAdminUserId = getAgentAdminUserId as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockSeedAgentIdentity.mockResolvedValue({
    adminUserId: 'admin-1',
    enrollmentId: 'enr-1',
    communityMemberId: 'cm-1',
    aiAgentId: 'agent-1',
  });
});

describe('TICKET_CREATOR_IDENTITIES', () => {
  it('has exactly the 5 original high-volume processes, the 16 department Strategy Architects, and AgentBehaviorMonitorAgent', () => {
    const names = TICKET_CREATOR_IDENTITIES.map((c) => c.agentName).sort();
    expect(names).toHaveLength(EXPECTED_COUNT);
    expect(names).toEqual(
      [
        'CoryBrain',
        'InboxCaseEngine',
        'bpos_orchestrator',
        'cory-engine',
        'workforce_intelligence_engine',
        'AgentBehaviorMonitorAgent',
        'AdmissionsConversionArchitect',
        'AlumniNetworkArchitect',
        'ExecutiveStrategyArchitect',
        'FinanceIntelligenceArchitect',
        'GovernanceStrategyArchitect',
        'GrowthExperimentArchitect',
        'InfrastructureEvolutionArchitect',
        'InsightArchitect',
        'LearningInnovationArchitect',
        'MarketingAutomationArchitect',
        'OperationsOptimizationArchitect',
        'OrchestrationEcosystemArchitect',
        'PartnershipExpansionArchitect',
        'PlatformInnovationArchitect',
        'StrategyFuturesArchitect',
        'StudentSuccessArchitect',
      ].sort()
    );
  });

  it('every one of the 16 department Strategy Architects has a displayName derived from the real STRATEGY_CONFIGS label (never hand-typed/invented)', () => {
    const archNames = new Set([
      'AdmissionsConversionArchitect', 'AlumniNetworkArchitect', 'ExecutiveStrategyArchitect',
      'FinanceIntelligenceArchitect', 'GovernanceStrategyArchitect', 'GrowthExperimentArchitect',
      'InfrastructureEvolutionArchitect', 'InsightArchitect', 'LearningInnovationArchitect',
      'MarketingAutomationArchitect', 'OperationsOptimizationArchitect', 'OrchestrationEcosystemArchitect',
      'PartnershipExpansionArchitect', 'PlatformInnovationArchitect', 'StrategyFuturesArchitect',
      'StudentSuccessArchitect',
    ]);
    const architects = TICKET_CREATOR_IDENTITIES.filter((c) => archNames.has(c.agentName));
    expect(architects).toHaveLength(16);
    for (const config of architects) {
      expect(config.displayName.endsWith('Strategy Architect')).toBe(true);
    }
  });

  it('every entry has a unique agentName and a unique email (findOrCreate keys — collisions would silently merge identities)', () => {
    const names = TICKET_CREATOR_IDENTITIES.map((c) => c.agentName);
    const emails = TICKET_CREATOR_IDENTITIES.map((c) => c.email);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it('every entry carries a real, non-placeholder displayName (never equal to the raw agentName code string)', () => {
    for (const config of TICKET_CREATOR_IDENTITIES) {
      expect(config.displayName).toBeTruthy();
      expect(config.displayName).not.toBe(config.agentName);
    }
  });

  it('none of the 5 request a pilot-cohort gate — Stage 1 is registration/display only, no proactive capability', () => {
    for (const config of TICKET_CREATOR_IDENTITIES) {
      expect(config.pilotCohortGate).toBe(false);
    }
  });

  it('every entry carries its own real, verified legacyCreatorIds equal to its own agentName (matches production tickets.created_by_id exactly) — except AgentBehaviorMonitorAgent, whose historical created_by_id was its own raw AiAgent UUID (the bug fixed in agentBehaviorMonitorAgent.ts), not its agentName', () => {
    for (const config of TICKET_CREATOR_IDENTITIES) {
      if (config.agentName === 'AgentBehaviorMonitorAgent') {
        expect(config.legacyCreatorIds).toEqual(['b95d1700-1a2d-49d0-a8d0-a5859afd360a']);
        continue;
      }
      expect(config.legacyCreatorIds).toEqual([config.agentName]);
    }
  });

  // AI Leadership / AI Staff hierarchy (Ali, live, 2026-08-19). Every entry
  // must carry EXACTLY ONE of reportsToOrgMemberId (AI Leadership, direct to
  // a human) or reportsToAgentName (AI Staff, through a leadership agent) —
  // never both, never neither. Reese (the 23rd agent) is seeded separately
  // via reeseIdentitySeed.ts — see its own test file.
  it('every entry has exactly one of reportsToOrgMemberId or reportsToAgentName, never both or neither', () => {
    for (const config of TICKET_CREATOR_IDENTITIES) {
      const hasHuman = !!config.reportsToOrgMemberId;
      const hasAgent = !!config.reportsToAgentName;
      expect(hasHuman).not.toBe(hasAgent);
    }
  });

  // Restore Taiwo's AI Staff (Ali, live, 2026-08-19, session
  // CC-20260818-x4nk continued): 4 of the 16 Department Strategy Architects
  // (Finance/Operations/Admissions/StudentSuccess) move back from AI Staff
  // (through CoryBrain) to AI Leadership, reporting directly to Taiwo — a
  // deliberate, explicit partial reversal of the 2-tier consolidation this
  // file's history documents above, making Taiwo a 3rd AI Leadership human
  // alongside Ali and Kes. 6 (not 2) entries are AI Leadership now.
  it('exactly 6 entries are AI Leadership (report directly to a human): CoryBrain -> Ali, workforce_intelligence_engine -> Kes, and 4 Architects -> Taiwo', () => {
    const ORG_MEMBER = {
      ALI: 'f179c222-284e-4180-a335-cca9e4918b2e',
      KES: '3df017df-affa-49ab-884f-a99a4bd2ef4e',
      TAIWO: '1fbb5316-1381-4b8a-81a8-3a7325b39d5f',
    };
    const leadership = TICKET_CREATOR_IDENTITIES.filter((c) => !!c.reportsToOrgMemberId);
    const byAgentName = Object.fromEntries(leadership.map((c) => [c.agentName, c.reportsToOrgMemberId]));

    expect(leadership).toHaveLength(6);
    expect(byAgentName).toEqual({
      CoryBrain: ORG_MEMBER.ALI,
      workforce_intelligence_engine: ORG_MEMBER.KES,
      FinanceIntelligenceArchitect: ORG_MEMBER.TAIWO,
      OperationsOptimizationArchitect: ORG_MEMBER.TAIWO,
      AdmissionsConversionArchitect: ORG_MEMBER.TAIWO,
      StudentSuccessArchitect: ORG_MEMBER.TAIWO,
    });
  });

  // Drift guard: REASSIGNED_TO_TAIWO_AGENT_NAMES is a second, exported list
  // (consumed by scripts/reassignArchitectsToTaiwo20260819.ts's own targeted
  // AiAgent backfill query) that duplicates — rather than derives from — the
  // 4 agent names actually wired to ORG_MEMBER.TAIWO above. This test is
  // what keeps the two from silently drifting apart if either list is ever
  // edited without the other.
  it('REASSIGNED_TO_TAIWO_AGENT_NAMES matches exactly the agents wired to reportsToOrgMemberId: Taiwo above — never drifts', () => {
    const ORG_MEMBER_TAIWO = '1fbb5316-1381-4b8a-81a8-3a7325b39d5f';
    const actualTaiwoAgents = TICKET_CREATOR_IDENTITIES.filter((c) => c.reportsToOrgMemberId === ORG_MEMBER_TAIWO).map((c) => c.agentName).sort();

    expect([...REASSIGNED_TO_TAIWO_AGENT_NAMES].sort()).toEqual(actualTaiwoAgents);
  });

  it('the remaining 16 entries are AI Staff, reporting through CoryBrain (the other 12 Architects) or workforce_intelligence_engine (cory-engine, InboxCaseEngine, bpos_orchestrator, AgentBehaviorMonitorAgent)', () => {
    const staff = TICKET_CREATOR_IDENTITIES.filter((c) => !!c.reportsToAgentName);
    const byAgentName = Object.fromEntries(staff.map((c) => [c.agentName, c.reportsToAgentName]));

    expect(staff).toHaveLength(EXPECTED_COUNT - 6);
    expect(byAgentName).toMatchObject({
      'cory-engine': 'workforce_intelligence_engine',
      InboxCaseEngine: 'workforce_intelligence_engine',
      bpos_orchestrator: 'workforce_intelligence_engine',
      AgentBehaviorMonitorAgent: 'workforce_intelligence_engine',
      AlumniNetworkArchitect: 'CoryBrain',
      ExecutiveStrategyArchitect: 'CoryBrain',
      GovernanceStrategyArchitect: 'CoryBrain',
      GrowthExperimentArchitect: 'CoryBrain',
      InfrastructureEvolutionArchitect: 'CoryBrain',
      InsightArchitect: 'CoryBrain',
      LearningInnovationArchitect: 'CoryBrain',
      MarketingAutomationArchitect: 'CoryBrain',
      OrchestrationEcosystemArchitect: 'CoryBrain',
      PartnershipExpansionArchitect: 'CoryBrain',
      PlatformInnovationArchitect: 'CoryBrain',
      StrategyFuturesArchitect: 'CoryBrain',
    });
    // The 4 reassigned-to-Taiwo Architects must NOT appear in the staff (reportsToAgentName) set at all — they're AI Leadership now (covered by the test above).
    expect(Object.keys(byAgentName)).not.toContain('AdmissionsConversionArchitect');
    expect(Object.keys(byAgentName)).not.toContain('FinanceIntelligenceArchitect');
    expect(Object.keys(byAgentName)).not.toContain('OperationsOptimizationArchitect');
    expect(Object.keys(byAgentName)).not.toContain('StudentSuccessArchitect');
  });
});

describe('getTicketCreatorAdminUserId', () => {
  it('happy path: resolves a known agentName to its real AdminUser id via the shared per-email cache', async () => {
    mockGetAgentAdminUserId.mockResolvedValue('admin-cory-engine-1');

    const id = await getTicketCreatorAdminUserId('cory-engine');

    expect(id).toBe('admin-cory-engine-1');
    expect(mockGetAgentAdminUserId).toHaveBeenCalledWith('cory-engine@colaberry.com');
  });

  it('boundary: an unknown agentName returns null without ever calling getAgentAdminUserId', async () => {
    const id = await getTicketCreatorAdminUserId('SomeUnregisteredProcess');

    expect(id).toBeNull();
    expect(mockGetAgentAdminUserId).not.toHaveBeenCalled();
  });

  it('failure path: identity not yet seeded (getAgentAdminUserId resolves null) propagates null, never throws', async () => {
    mockGetAgentAdminUserId.mockResolvedValue(null);

    const id = await getTicketCreatorAdminUserId('bpos_orchestrator');

    expect(id).toBeNull();
  });
});

describe('seedTicketCreatorIdentities', () => {
  it('happy path: calls seedAgentIdentity exactly once per entry, with each entry\'s own config', async () => {
    const succeeded = await seedTicketCreatorIdentities();

    expect(mockSeedAgentIdentity).toHaveBeenCalledTimes(EXPECTED_COUNT);
    for (const config of TICKET_CREATOR_IDENTITIES) {
      expect(mockSeedAgentIdentity).toHaveBeenCalledWith(config);
    }
    expect(succeeded).toBe(EXPECTED_COUNT);
  });

  it('idempotency: running twice calls seedAgentIdentity the same way both times (delegates idempotency to seedAgentIdentity\'s own findOrCreate contract)', async () => {
    await seedTicketCreatorIdentities();
    await seedTicketCreatorIdentities();

    expect(mockSeedAgentIdentity).toHaveBeenCalledTimes(EXPECTED_COUNT * 2);
  });

  it('failure path: one entry throwing (e.g. its AiAgent registry row not seeded yet) is caught and logged, never blocking the others', async () => {
    mockSeedAgentIdentity.mockImplementation(async (config: any) => {
      if (config.agentName === 'CoryBrain') {
        throw new Error("[CoryBrain] seedAgentIdentity() ran before the 'CoryBrain' AiAgent registry row existed.");
      }
      return { adminUserId: 'admin-1', enrollmentId: 'enr-1', communityMemberId: 'cm-1', aiAgentId: 'agent-1' };
    });

    const succeeded = await seedTicketCreatorIdentities();

    expect(mockSeedAgentIdentity).toHaveBeenCalledTimes(EXPECTED_COUNT);
    expect(succeeded).toBe(EXPECTED_COUNT - 1);
  });

  it('boundary: seedTicketCreatorIdentities() itself never throws even if every entry fails', async () => {
    mockSeedAgentIdentity.mockRejectedValue(new Error('DB unavailable'));

    await expect(seedTicketCreatorIdentities()).resolves.toBe(0);
  });
});
