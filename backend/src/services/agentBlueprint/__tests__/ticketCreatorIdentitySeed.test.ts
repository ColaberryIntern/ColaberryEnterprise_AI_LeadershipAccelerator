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
const EXPECTED_COUNT = 21;
jest.mock('../agentIdentitySeed', () => ({
  seedAgentIdentity: jest.fn(),
  getAgentAdminUserId: jest.fn(),
}));

import { seedAgentIdentity, getAgentAdminUserId } from '../agentIdentitySeed';
import {
  seedTicketCreatorIdentities,
  getTicketCreatorAdminUserId,
  TICKET_CREATOR_IDENTITIES,
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
  it('has exactly the 5 original high-volume processes plus the 16 department Strategy Architects', () => {
    const names = TICKET_CREATOR_IDENTITIES.map((c) => c.agentName).sort();
    expect(names).toHaveLength(EXPECTED_COUNT);
    expect(names).toEqual(
      [
        'CoryBrain',
        'InboxCaseEngine',
        'bpos_orchestrator',
        'cory-engine',
        'workforce_intelligence_engine',
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

  it('every entry carries its own real, verified legacyCreatorIds equal to its own agentName (matches production tickets.created_by_id exactly)', () => {
    for (const config of TICKET_CREATOR_IDENTITIES) {
      expect(config.legacyCreatorIds).toEqual([config.agentName]);
    }
  });

  // Agent Ticket Standard (2026-08-18, session CC-20260818-x4nk) — the exact,
  // founder-given agent -> human mapping (request.md). Every one of the 21
  // entries here (Reese, the 22nd agent, is seeded separately via
  // reeseIdentitySeed.ts — see its own test file) must carry the real
  // org_members.id the founder assigned, at the right per-human counts.
  it('every entry has a non-empty reportsToOrgMemberId (the structural requirement itself)', () => {
    for (const config of TICKET_CREATOR_IDENTITIES) {
      expect(config.reportsToOrgMemberId).toBeTruthy();
    }
  });

  it('matches the founder-given mapping exactly, at the right per-human counts (Ali x9, Kes x5, Taiwo x4 [Reese is the 5th, seeded separately], Jackie x1, Swati x1, Sohail x1)', () => {
    const ORG_MEMBER = {
      ALI: 'f179c222-284e-4180-a335-cca9e4918b2e',
      KES: '3df017df-affa-49ab-884f-a99a4bd2ef4e',
      TAIWO: '1fbb5316-1381-4b8a-81a8-3a7325b39d5f',
      JACKIE: 'a6db5276-2993-4e0b-ace9-0052ba841c80',
      SWATI: '5db87b51-4554-4e52-93d7-c61f9887352c',
      SOHAIL: '4e255894-ac0b-4367-ae06-27459ea05f66',
    };
    const byAgentName = Object.fromEntries(
      TICKET_CREATOR_IDENTITIES.map((c) => [c.agentName, c.reportsToOrgMemberId]),
    );

    expect(byAgentName).toMatchObject({
      // Ali (9 in this array; CoryBrain/InboxCaseEngine/bpos_orchestrator are hand-written)
      CoryBrain: ORG_MEMBER.ALI,
      InboxCaseEngine: ORG_MEMBER.ALI,
      bpos_orchestrator: ORG_MEMBER.ALI,
      ExecutiveStrategyArchitect: ORG_MEMBER.ALI,
      GovernanceStrategyArchitect: ORG_MEMBER.ALI,
      GrowthExperimentArchitect: ORG_MEMBER.ALI,
      InsightArchitect: ORG_MEMBER.ALI,
      PartnershipExpansionArchitect: ORG_MEMBER.ALI,
      StrategyFuturesArchitect: ORG_MEMBER.ALI,
      // Kes (5)
      'cory-engine': ORG_MEMBER.KES,
      workforce_intelligence_engine: ORG_MEMBER.KES,
      InfrastructureEvolutionArchitect: ORG_MEMBER.KES,
      OrchestrationEcosystemArchitect: ORG_MEMBER.KES,
      PlatformInnovationArchitect: ORG_MEMBER.KES,
      // Taiwo (4 here; Reese is the 5th, seeded separately)
      AdmissionsConversionArchitect: ORG_MEMBER.TAIWO,
      FinanceIntelligenceArchitect: ORG_MEMBER.TAIWO,
      OperationsOptimizationArchitect: ORG_MEMBER.TAIWO,
      StudentSuccessArchitect: ORG_MEMBER.TAIWO,
      // Jackie (1)
      AlumniNetworkArchitect: ORG_MEMBER.JACKIE,
      // Swati (1)
      LearningInnovationArchitect: ORG_MEMBER.SWATI,
      // Sohail (1)
      MarketingAutomationArchitect: ORG_MEMBER.SOHAIL,
    });
    expect(Object.keys(byAgentName)).toHaveLength(EXPECTED_COUNT);
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
