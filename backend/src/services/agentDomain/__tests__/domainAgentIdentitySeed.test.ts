/**
 * AF3.1 follow-on — identity makes an agent VISIBLE, never ALIVE.
 *
 * Seeding identity creates three real rows per agent, including an `AdminUser` on the same model
 * human staff use. The risk is not that it fails; it is that it quietly does more than it says.
 * So these tests assert the boundary: the config this seeder passes must never carry `enabled`,
 * `autonomy_level` or `tools_granted`, and must never ask for a portal-enabled learner.
 *
 * `seedAgentIdentity` is mocked. That is deliberate and worth stating: the real function writes
 * four tables, and this suite is about WHAT IS ASKED OF IT, not about whether Sequelize works.
 * The writing is covered by the identity seeder's own tests and was exercised against production
 * by the AF3.1 preview.
 */
const mockSeed = jest.fn();
const mockFindByPk = jest.fn();
const mockQuery = jest.fn();

jest.mock('../../agentBlueprint/agentIdentitySeed', () => ({
  seedAgentIdentity: (cfg: any) => mockSeed(cfg),
}));
jest.mock('../../../models/AiAgent', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockFindByPk(...a) },
}));
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: any[]) => mockQuery(...a) },
}));

import { seedDomainAgentIdentities, domainAgentEmail } from '../domainAgentIdentitySeed';
import { DOMAIN_AGENT_ENTRIES } from '../../agentRegistry/domainAgents';

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([
    { domain_key: 'marketing', manager_identity_id: 'mgr-marketing' },
    { domain_key: 'platform', manager_identity_id: null },
  ]);
  mockSeed.mockImplementation(async (cfg: any) => ({
    aiAgentId: `ai-${cfg.agentName}`, enrollmentId: 'e', communityMemberId: 'c', adminUserId: 'a',
  }));
  mockFindByPk.mockResolvedValue({ record_kind: null, update: jest.fn().mockResolvedValue(undefined) });
});

describe('identity seeding covers all ten and keys on the domain', () => {
  it('seeds one identity per registered domain agent', async () => {
    const res = await seedDomainAgentIdentities();
    expect(res).toHaveLength(DOMAIN_AGENT_ENTRIES.length);
    expect(mockSeed).toHaveBeenCalledTimes(DOMAIN_AGENT_ENTRIES.length);
  });

  it('derives the email from the DOMAIN KEY, not the display name', () => {
    // The email is the idempotency key the whole seed resolves on. A display name is the sort
    // of thing somebody renames, and a renamed key creates a second identity on the next boot.
    expect(domainAgentEmail('product_experience')).toBe('product-experience-agent@colaberry.com');
    expect(domainAgentEmail('marketing')).toBe('marketing-agent@colaberry.com');
  });

  it('gives every agent a distinct email', async () => {
    await seedDomainAgentIdentities();
    const emails = mockSeed.mock.calls.map(([c]) => c.email);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it('passes the domain manager when there is one, and omits it when there is not', async () => {
    await seedDomainAgentIdentities();
    const byName = Object.fromEntries(mockSeed.mock.calls.map(([c]) => [c.agentName, c]));
    expect(byName.MarketingDomainAgent.reportsToOrgMemberId).toBe('mgr-marketing');
    // platform's manager resolved to null in the fixture: the key must be ABSENT, not null,
    // so the seeder's own self-heal decides rather than being handed a null to write.
    expect('reportsToOrgMemberId' in byName.PlatformDomainAgent).toBe(false);
  });
});

describe('identity does not make an agent alive', () => {
  it('never passes enabled, autonomy_level or tools_granted', async () => {
    // The whole boundary, in one assertion. Release Zero's floor is set by the registry entry;
    // this path must not be a second place that can change it.
    await seedDomainAgentIdentities();
    for (const [cfg] of mockSeed.mock.calls) {
      expect(cfg).not.toHaveProperty('enabled');
      expect(cfg).not.toHaveProperty('autonomy_level');
      expect(cfg).not.toHaveProperty('tools_granted');
      expect(cfg).not.toHaveProperty('system_prompt');
    }
  });

  it('never creates a portal-enabled learner', async () => {
    await seedDomainAgentIdentities();
    for (const [cfg] of mockSeed.mock.calls) {
      expect(cfg.enrollmentDefaults.portal_enabled).toBe(false);
      expect(cfg.role).toBe('ai_staff');
      expect(cfg.communityRole).toBe('staff');
      expect(cfg.pilotCohortGate).toBe(false);
    }
  });

  it('classifies them as employees without overwriting an existing classification', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    mockFindByPk.mockResolvedValue({ record_kind: 'behavior', update });
    await seedDomainAgentIdentities();
    // Already classified: left alone. Same self-heal-only-when-null posture as Dara's seed.
    expect(update).not.toHaveBeenCalled();
  });
});

describe('one bad row does not cost the other nine', () => {
  it('carries a per-agent failure and keeps going', async () => {
    mockSeed.mockImplementation(async (cfg: any) => {
      if (cfg.agentName === 'MarketingDomainAgent') throw new Error('boom');
      return { aiAgentId: `ai-${cfg.agentName}` };
    });
    const res = await seedDomainAgentIdentities();
    expect(res).toHaveLength(DOMAIN_AGENT_ENTRIES.length);
    const failed = res.filter((r) => r.ids === null);
    expect(failed).toHaveLength(1);
    expect(failed[0].agentName).toBe('MarketingDomainAgent');
    expect(failed[0].error).toMatch(/boom/);
    // And the rest genuinely succeeded rather than being skipped.
    expect(res.filter((r) => r.ids !== null)).toHaveLength(DOMAIN_AGENT_ENTRIES.length - 1);
  });
});
