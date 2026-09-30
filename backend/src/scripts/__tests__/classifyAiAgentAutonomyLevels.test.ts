/**
 * classifyAiAgentAutonomyLevels — the reporting rule + idempotency contract.
 *
 * `summarise` is what an operator reads before deciding to run `--apply`
 * (mirrors classifyAiAgentDepartments.test.ts's own shape); `classify`'s
 * DB-touching idempotency contract gets its own direct, mocked coverage —
 * per CLAUDE.md's mandatory idempotency-validation test type, this is the
 * one property that MUST be proven, not just implied: running the same
 * operation twice must produce the same end state, and it must never
 * overwrite a value a real human set.
 */
const mockAiAgentFindAll = jest.fn();
jest.mock('../../models/AiAgent', () => ({
  __esModule: true,
  default: { findAll: (...a: any[]) => mockAiAgentFindAll(...a) },
}));

import { classify, summarise } from '../classifyAiAgentAutonomyLevels';

type Row = Parameters<typeof summarise>[0][number];

const row = (over: Partial<Row> = {}): Row => ({
  agentId: 'a1', agentName: 'SomeAgent', toolsGranted: ['create_tickets'],
  alreadySet: false, newLevel: 'act_audited', reason: 'test', matchedTool: 'create_tickets', applied: false,
  ...over,
} as Row);

function fakeAgent(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'agent-1',
    agent_name: 'SomeAgent',
    tools_granted: ['create_tickets'],
    autonomy_level_set_at: null,
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('summarise', () => {
  it('never counts an agent that already had a level set as one "to classify"', () => {
    const out = summarise([row({ alreadySet: true }), row({ alreadySet: false })]);
    expect(out).toContain('already had a level set:     1');
    expect(out).toContain('to classify:                 1');
  });

  it('splits agents to classify by the real level distribution', () => {
    const out = summarise([
      row({ newLevel: 'observe' }),
      row({ newLevel: 'observe' }),
      row({ newLevel: 'communicate', agentName: 'ReeseLike', matchedTool: 'send_email' }),
    ]);
    expect(out).toContain('-> observe:      2');
    expect(out).toContain('-> communicate:  1');
  });

  it('separates agents with real tools_granted data from the no-data safe-default case', () => {
    const out = summarise([
      row({ toolsGranted: ['create_tickets'] }),
      row({ toolsGranted: null, newLevel: 'observe' }),
      row({ toolsGranted: [], newLevel: 'observe' }),
    ]);
    expect(out).toContain('-> from real tools_granted: 1');
    expect(out).toContain('-> no tools_granted (safe observe default): 2');
  });

  it('names each communicate-tier agent explicitly — the highest trust level always gets called out, never folded into a total', () => {
    const out = summarise([row({ agentName: 'Reese', newLevel: 'communicate', matchedTool: 'respond_to_dm' })]);
    expect(out).toContain('COMMUNICATE-TIER');
    expect(out).toContain('Reese');
    expect(out).toContain('respond_to_dm');
  });

  it('counts what was actually applied this run, distinct from what was merely classified', () => {
    const out = summarise([row({ applied: true }), row({ applied: false })]);
    expect(out).toContain('applied this run:            1');
  });

  it('reports zeros cleanly on an empty run', () => {
    const out = summarise([]);
    expect(out).toContain('agents checked:              0');
    expect(out).toContain('already had a level set:     0');
  });
});

describe('classify — idempotency and human-decision safety', () => {
  it('dry run (apply=false) never calls update, even on an unset agent', async () => {
    const agent = fakeAgent({ autonomy_level_set_at: null });
    mockAiAgentFindAll.mockResolvedValue([agent]);

    const rows = await classify(false);

    expect(agent.update).not.toHaveBeenCalled();
    expect(rows[0].applied).toBe(false);
  });

  it('happy path: --apply stamps a real, classified level on an agent nobody has ever set', async () => {
    const agent = fakeAgent({ autonomy_level_set_at: null, tools_granted: ['create_tickets'] });
    mockAiAgentFindAll.mockResolvedValue([agent]);

    const rows = await classify(true);

    expect(agent.update).toHaveBeenCalledWith(
      expect.objectContaining({ autonomy_level: 'act_audited', autonomy_level_source: 'auto' }),
    );
    expect(agent.update.mock.calls[0][0].autonomy_level_set_at).toBeInstanceOf(Date);
    expect(rows[0].applied).toBe(true);
  });

  it('idempotency: an agent already set by a real human is never touched, even under --apply', async () => {
    const agent = fakeAgent({ autonomy_level_set_at: new Date('2026-08-01T00:00:00Z') });
    mockAiAgentFindAll.mockResolvedValue([agent]);

    const rows = await classify(true);

    expect(agent.update).not.toHaveBeenCalled();
    expect(rows[0].alreadySet).toBe(true);
    expect(rows[0].applied).toBe(false);
  });

  it('idempotency: running --apply twice on the same agent only writes once (second run sees the now-set autonomy_level_set_at)', async () => {
    const agent = fakeAgent({ autonomy_level_set_at: null });
    mockAiAgentFindAll.mockResolvedValue([agent]);
    await classify(true);
    expect(agent.update).toHaveBeenCalledTimes(1);

    // Second run: the same agent object now has a real set_at (as it would
    // after a real DB round-trip) — must be left alone.
    agent.autonomy_level_set_at = new Date();
    mockAiAgentFindAll.mockResolvedValue([agent]);
    const rows = await classify(true);

    expect(agent.update).toHaveBeenCalledTimes(1); // still just the first call
    expect(rows[0].applied).toBe(false);
  });

  it('an agent with no tools_granted data gets the real, honest observe default, not skipped or errored', async () => {
    const agent = fakeAgent({ autonomy_level_set_at: null, tools_granted: null });
    mockAiAgentFindAll.mockResolvedValue([agent]);

    const rows = await classify(true);

    expect(rows[0].newLevel).toBe('observe');
    expect(agent.update).toHaveBeenCalledWith(expect.objectContaining({ autonomy_level: 'observe' }));
  });
});

describe('classify — scoping to a single agent (the "migrate one at a time" shape)', () => {
  it('passing an agentName filters the DB query to that agent, on top of the existing enabled:true filter', async () => {
    mockAiAgentFindAll.mockResolvedValue([fakeAgent({ agent_name: 'Reese' })]);

    await classify(true, 'Reese');

    expect(mockAiAgentFindAll).toHaveBeenCalledWith({ where: { enabled: true, agent_name: 'Reese' } });
  });

  it('omitting agentName runs the original whole-fleet query, unchanged', async () => {
    mockAiAgentFindAll.mockResolvedValue([fakeAgent()]);

    await classify(true);

    expect(mockAiAgentFindAll).toHaveBeenCalledWith({ where: { enabled: true } });
  });
});
