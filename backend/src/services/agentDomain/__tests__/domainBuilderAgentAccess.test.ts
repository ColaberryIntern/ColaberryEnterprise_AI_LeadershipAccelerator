/**
 * isVerifiedDomainBuilderOfAgent — the question "may this builder READ this agent?"
 *
 * The resolver underneath (`loadProvisionedDomainsForBuilder`) already has its own tests for
 * name resolution and the ambiguity guard. This file does not re-test those. It tests the three
 * things THIS module adds: the agent must match, the builder state must be verified_active, and
 * an empty agent id must never match a domain that has no agent.
 */

const mockLoadForBuilder = jest.fn();
jest.mock('../agentDomainProvisionedReader', () => ({
  loadProvisionedDomainsForBuilder: (...a: any[]) => mockLoadForBuilder(...a),
}));


import {
  BUILDER_STATE_THAT_GRANTS_READ,
  isVerifiedDomainBuilderOfAgent,
} from '../domainBuilderAgentAccess';

const AGENT = '7b72d4ed-0876-40a6-9571-78473ace091f'; // ProductExperienceDomainAgent, in prod
const EMAIL = 'mihretnetsereab@gmail.com';

/** The shape the reader really returns, trimmed to the fields this module reads. */
function row(over: Record<string, unknown> = {}) {
  return {
    domain_key: 'product_experience',
    agent_id: AGENT,
    intended_builder_state: 'verified_active',
    ...over,
  };
}

beforeEach(() => { jest.clearAllMocks(); });

describe('the builder of this agent', () => {
  it('POSITIVE CONTROL: the real shape resolves true, so every false below means something', async () => {
    mockLoadForBuilder.mockResolvedValue([row()]);
    await expect(isVerifiedDomainBuilderOfAgent(EMAIL, AGENT)).resolves.toBe(true);
  });

  it('passes the caller email straight to the shared resolver, never a name', async () => {
    mockLoadForBuilder.mockResolvedValue([row()]);
    await isVerifiedDomainBuilderOfAgent(EMAIL, AGENT);
    expect(mockLoadForBuilder).toHaveBeenCalledWith(expect.anything(), EMAIL);
  });

  it('trims the inputs rather than failing on a stray space', async () => {
    mockLoadForBuilder.mockResolvedValue([row()]);
    await expect(isVerifiedDomainBuilderOfAgent(`  ${EMAIL} `, ` ${AGENT}  `)).resolves.toBe(true);
  });
});

describe('what does NOT grant read', () => {
  it('a different agent in the same domain list', async () => {
    mockLoadForBuilder.mockResolvedValue([row()]);
    await expect(isVerifiedDomainBuilderOfAgent(EMAIL, 'some-other-agent')).resolves.toBe(false);
  });

  it('being the builder but NOT verified_active', async () => {
    // Ruth Kumera on curriculum is exactly this today: onboarding_pending. A name written
    // against a domain before the person is verified is an intention, not an identity.
    mockLoadForBuilder.mockResolvedValue([row({ intended_builder_state: 'onboarding_pending' })]);
    await expect(isVerifiedDomainBuilderOfAgent(EMAIL, AGENT)).resolves.toBe(false);
  });

  it('an unassigned builder state', async () => {
    mockLoadForBuilder.mockResolvedValue([row({ intended_builder_state: 'unassigned' })]);
    await expect(isVerifiedDomainBuilderOfAgent(EMAIL, AGENT)).resolves.toBe(false);
  });

  it('a null builder state', async () => {
    mockLoadForBuilder.mockResolvedValue([row({ intended_builder_state: null })]);
    await expect(isVerifiedDomainBuilderOfAgent(EMAIL, AGENT)).resolves.toBe(false);
  });

  it('building NOTHING — the resolver found no domains for this email', async () => {
    mockLoadForBuilder.mockResolvedValue([]);
    await expect(isVerifiedDomainBuilderOfAgent(EMAIL, AGENT)).resolves.toBe(false);
  });
});

describe('the empty-id trap', () => {
  /**
   * THE BUG THIS PREVENTS, written down because it is not obvious from reading the code.
   *
   * Six of the ten domain rows can carry a NULL `agent_id` -- the reader's BASE_SQL LEFT JOINs
   * `ai_agents`, so "no employee yet" is a real row rather than a missing one. Without the empty
   * -id guard, `String(null ?? '').trim() === ''` is TRUE, so a request carrying no agent id at
   * all would match the builder's unprovisioned domain and be waved through.
   */
  it('an empty agent id does NOT match a domain whose agent_id is null', async () => {
    mockLoadForBuilder.mockResolvedValue([row({ agent_id: null })]);
    await expect(isVerifiedDomainBuilderOfAgent(EMAIL, '')).resolves.toBe(false);
  });

  it('a whitespace-only agent id does not either', async () => {
    mockLoadForBuilder.mockResolvedValue([row({ agent_id: null })]);
    await expect(isVerifiedDomainBuilderOfAgent(EMAIL, '   ')).resolves.toBe(false);
  });

  it('a real agent id still does not match a null agent_id row', async () => {
    mockLoadForBuilder.mockResolvedValue([row({ agent_id: null })]);
    await expect(isVerifiedDomainBuilderOfAgent(EMAIL, AGENT)).resolves.toBe(false);
  });

  it('an empty email never reaches the resolver at all', async () => {
    await expect(isVerifiedDomainBuilderOfAgent('', AGENT)).resolves.toBe(false);
    expect(mockLoadForBuilder).not.toHaveBeenCalled();
  });
});

describe('the state constant', () => {
  it('is the one state, named, so the gate and the tests cannot drift', () => {
    expect(BUILDER_STATE_THAT_GRANTS_READ).toBe('verified_active');
  });
});
