/**
 * Covers the one thing agentRegistryAuditClassification.test.ts can't: the DB-write
 * behavior of auditAgentRegistryStatus.ts itself — specifically that config is
 * MERGED, not replaced (an agent's pre-existing config keys must survive getting
 * registry_audit added alongside them), and that --execute vs dry-run actually gates
 * whether AiAgent.update is called at all.
 *
 * main() is exported and guarded behind `require.main === module` in the script
 * specifically so it can be imported and awaited directly here, rather than relying on
 * import-time side effects (which would resolve before the async work inside main()
 * actually finishes).
 */
jest.mock('../../models/AiAgent', () => ({ __esModule: true, default: { findOne: jest.fn() } }));

import AiAgent from '../../models/AiAgent';
import { main } from '../auditAgentRegistryStatus';

const findOneMock = AiAgent.findOne as jest.Mock;

// classifyAgent() enumerates the no-source-file agents first, so this is always the
// first name main() looks up — a real confirmed_dead entry (disable: true).
const FIRST_ENUMERATED_AGENT_NAME = 'Enterprise_Opportunity_Agent';

function fakeAgentRow(config: Record<string, any> = {}) {
  const update = jest.fn().mockResolvedValue(undefined);
  return { agent_name: FIRST_ENUMERATED_AGENT_NAME, config, update };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('auditAgentRegistryStatus main() --execute', () => {
  it('merges registry_audit into an existing config object rather than replacing it', async () => {
    const agent = fakeAgentRow({ retention_days: 30, some_other_key: 'keep-me' });
    findOneMock.mockResolvedValue(agent); // same row resolves for every lookup; asserting on the first call is sufficient here

    await main(['--execute']);

    expect(agent.update).toHaveBeenCalled();
    const payload = agent.update.mock.calls[0][0];
    expect(payload.config.retention_days).toBe(30);
    expect(payload.config.some_other_key).toBe('keep-me');
    expect(payload.config.registry_audit).toEqual(expect.objectContaining({ status: 'confirmed_dead' }));
  });

  it('sets enabled: false for a confirmed_dead entry', async () => {
    const agent = fakeAgentRow();
    findOneMock.mockResolvedValue(agent);

    await main(['--execute']);

    expect(agent.update.mock.calls[0][0].enabled).toBe(false);
  });
});

describe('auditAgentRegistryStatus main() dry-run (default)', () => {
  it('never calls AiAgent.update when --execute is not passed', async () => {
    const agent = fakeAgentRow({ retention_days: 30 });
    findOneMock.mockResolvedValue(agent);

    await main([]);

    expect(agent.update).not.toHaveBeenCalled();
  });
});
