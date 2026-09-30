jest.mock('../../models/AgentPersonaVersionHistory', () => ({ create: jest.fn(), findAll: jest.fn() }));

import AgentPersonaVersionHistory from '../../models/AgentPersonaVersionHistory';
import { recordPersonaVersionChangeIfNeeded, getPersonaVersionHistory } from '../agentPersonaVersionHistoryService';

const mockCreate = AgentPersonaVersionHistory.create as unknown as jest.Mock;
const mockFindAll = AgentPersonaVersionHistory.findAll as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('recordPersonaVersionChangeIfNeeded', () => {
  it('writes a real history row when the incoming version genuinely differs from what was stored', async () => {
    await recordPersonaVersionChangeIfNeeded('agent-1', '2026-08-06', {
      agent_name: 'Reese',
      persona_version: '2026-09-01',
      system_prompt: 'NEW PROMPT',
      tools_granted: ['respond_to_dm'],
    });

    expect(mockCreate).toHaveBeenCalledWith({
      agent_id: 'agent-1',
      agent_name: 'Reese',
      persona_version: '2026-09-01',
      previous_version: '2026-08-06',
      system_prompt: 'NEW PROMPT',
      tools_granted: ['respond_to_dm'],
      source: 'registry_seed',
    });
  });

  it('is a no-op on the common case: the registry entry\'s version matches what is already stored', async () => {
    await recordPersonaVersionChangeIfNeeded('agent-1', '2026-08-06', {
      agent_name: 'Reese',
      persona_version: '2026-08-06',
    });

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('is idempotent across two boots: same input twice writes the same one row, not two', async () => {
    const entry = { agent_name: 'Reese', persona_version: '2026-09-01' };
    await recordPersonaVersionChangeIfNeeded('agent-1', '2026-08-06', entry); // boot 1: real change
    await recordPersonaVersionChangeIfNeeded('agent-1', '2026-09-01', entry); // boot 2: now matches — no-op

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the registry entry does not declare a persona_version at all', async () => {
    await recordPersonaVersionChangeIfNeeded('agent-1', '2026-08-06', { agent_name: 'SomeOtherAgent' });

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('records the first-ever version with previous_version: null, for a brand-new agent', async () => {
    await recordPersonaVersionChangeIfNeeded('agent-2', null, {
      agent_name: 'Reese',
      persona_version: '2026-08-06',
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ persona_version: '2026-08-06', previous_version: null }),
    );
  });

  // Found live in CI (2026-08-26): several pre-existing agentRegistrySeed
  // test files exercise the real seedAgentRegistry() loop without mocking
  // this service, so a real DB validation error surfaced here and aborted
  // their entire test — proving the real production risk this test pins:
  // one bad history write must never break the loop that registers ~200
  // real agents.
  it('swallow-safe: a DB error writing the history row is caught and logged, never thrown — the caller (seedAgentRegistry) must keep running', async () => {
    mockCreate.mockRejectedValue(new Error('db validation failed'));

    await expect(
      recordPersonaVersionChangeIfNeeded('agent-1', '2026-08-06', { agent_name: 'Reese', persona_version: '2026-09-01' }),
    ).resolves.toBeUndefined();
  });
});

describe('getPersonaVersionHistory', () => {
  it('returns real rows, most-recent first, mapped to the public shape', async () => {
    const createdAt = new Date('2026-08-26T10:00:00Z');
    mockFindAll.mockResolvedValue([
      { id: 'h1', persona_version: '2026-09-01', previous_version: '2026-08-06', source: 'registry_seed', created_at: createdAt },
    ]);

    const result = await getPersonaVersionHistory('agent-1');

    expect(mockFindAll).toHaveBeenCalledWith({ where: { agent_id: 'agent-1' }, order: [['created_at', 'DESC']] });
    expect(result).toEqual([
      { id: 'h1', persona_version: '2026-09-01', previous_version: '2026-08-06', source: 'registry_seed', created_at: createdAt },
    ]);
  });

  it('boundary: [] for an agent whose version has never changed, not an error', async () => {
    mockFindAll.mockResolvedValue([]);

    const result = await getPersonaVersionHistory('agent-1');

    expect(result).toEqual([]);
  });
});
