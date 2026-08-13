/**
 * Agent Registration Stage 1 — tests for the 5-entry ticket-creator identity
 * wrapper. Mocks seedAgentIdentity() directly (its own behavior is already
 * covered by agentIdentitySeed.test.ts) so this file focuses on what this
 * wrapper itself is responsible for: the 5 configs are well-formed and
 * distinct, one call per entry, one failure never blocks the others
 * (failure-path coverage), and running twice behaves identically both times
 * (idempotency coverage) — per CLAUDE.md's Mandatory Test Types.
 */
jest.mock('../agentIdentitySeed', () => ({
  seedAgentIdentity: jest.fn(),
}));

import { seedAgentIdentity } from '../agentIdentitySeed';
import {
  seedTicketCreatorIdentities,
  TICKET_CREATOR_IDENTITIES,
} from '../ticketCreatorIdentitySeed';

const mockSeedAgentIdentity = seedAgentIdentity as unknown as jest.Mock;

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
  it('has exactly the 5 real, unregistered, high-volume processes named in the request', () => {
    const names = TICKET_CREATOR_IDENTITIES.map((c) => c.agentName).sort();
    expect(names).toEqual(
      [
        'CoryBrain',
        'InboxCaseEngine',
        'bpos_orchestrator',
        'cory-engine',
        'workforce_intelligence_engine',
      ].sort()
    );
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
});

describe('seedTicketCreatorIdentities', () => {
  it('happy path: calls seedAgentIdentity exactly once per entry, with each entry\'s own config', async () => {
    const succeeded = await seedTicketCreatorIdentities();

    expect(mockSeedAgentIdentity).toHaveBeenCalledTimes(5);
    for (const config of TICKET_CREATOR_IDENTITIES) {
      expect(mockSeedAgentIdentity).toHaveBeenCalledWith(config);
    }
    expect(succeeded).toBe(5);
  });

  it('idempotency: running twice calls seedAgentIdentity the same way both times (delegates idempotency to seedAgentIdentity\'s own findOrCreate contract)', async () => {
    await seedTicketCreatorIdentities();
    await seedTicketCreatorIdentities();

    expect(mockSeedAgentIdentity).toHaveBeenCalledTimes(10);
  });

  it('failure path: one entry throwing (e.g. its AiAgent registry row not seeded yet) is caught and logged, never blocking the other 4', async () => {
    mockSeedAgentIdentity.mockImplementation(async (config: any) => {
      if (config.agentName === 'CoryBrain') {
        throw new Error("[CoryBrain] seedAgentIdentity() ran before the 'CoryBrain' AiAgent registry row existed.");
      }
      return { adminUserId: 'admin-1', enrollmentId: 'enr-1', communityMemberId: 'cm-1', aiAgentId: 'agent-1' };
    });

    const succeeded = await seedTicketCreatorIdentities();

    expect(mockSeedAgentIdentity).toHaveBeenCalledTimes(5);
    expect(succeeded).toBe(4);
  });

  it('boundary: seedTicketCreatorIdentities() itself never throws even if every entry fails', async () => {
    mockSeedAgentIdentity.mockRejectedValue(new Error('DB unavailable'));

    await expect(seedTicketCreatorIdentities()).resolves.toBe(0);
  });
});
