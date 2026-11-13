/**
 * AF3.5 — the grant service: what it writes, what it refuses to write, and what it rolls back.
 *
 * Three properties, in the order they matter:
 *
 *   1. A refused grant writes NOTHING. Not a ledger row, not the column.
 *   2. A permitted grant writes the ledger row and `tools_granted`, inside one transaction,
 *      with the agent row locked.
 *   3. If anything else on the row moved between the pre-read and the post-read, the service
 *      throws and the transaction rolls back. That check lives in the production path, so it
 *      holds for callers written after this test.
 */

const mockResolveHumans = jest.fn();
const mockConfirmedIds = jest.fn();
const mockAllCapabilities = jest.fn();
const mockRegistered = jest.fn();
const mockAgentFindByPk = jest.fn();
const mockGrantFindOrCreate = jest.fn();
const mockGrantFindAll = jest.fn();

jest.mock('./../recordedHumans', () => ({
  resolveRecordedHumans: (...a: unknown[]) => mockResolveHumans(...a),
}));
jest.mock('./../capabilityConfirmationService', () => ({
  loadConfirmedCapabilityIds: (...a: unknown[]) => mockConfirmedIds(...a),
}));
jest.mock('./../capabilityRecord', () => ({
  allCapabilities: (...a: unknown[]) => mockAllCapabilities(...a),
  // The REAL implementation, copied: this is the function under test's dependency, and a mock
  // that answered 'confirmed' unconditionally would make the draft refusal untestable.
  effectiveValidationState: (
    cap: { capability_id: string; requirement_validation_state: string },
    recorded: string[] = [],
  ) => {
    if (cap.requirement_validation_state === 'rejected') return 'rejected';
    return recorded.includes(cap.capability_id) ? 'confirmed' : cap.requirement_validation_state;
  },
}));
jest.mock('./../registeredTools', () => ({
  registeredToolNames: (...a: unknown[]) => mockRegistered(...a),
}));
jest.mock('../../../models/AiAgent', () => ({
  __esModule: true,
  default: { findByPk: (...a: unknown[]) => mockAgentFindByPk(...a) },
}));
jest.mock('../../../models/AgentDomainToolGrant', () => ({
  __esModule: true,
  default: {
    findOrCreate: (...a: unknown[]) => mockGrantFindOrCreate(...a),
    findAll: (...a: unknown[]) => mockGrantFindAll(...a),
  },
}));

import { Transaction } from 'sequelize';
import {
  ToolGrantRefusedError,
  ToolGrantTouchedMoreThanToolsError,
  grantToolToAgent,
} from '../agentToolGrantService';

const AGENT_ID = '11111111-2222-4333-8444-555555555555';
const ALI = 'ali@colaberry.com';
const CAP = 'admissions.CAP.reply';

/** A real transaction runner, so the callback executes and the writes are observable. */
const sequelize = {
  transaction: async (fn: (t: unknown) => Promise<unknown>) => fn({ id: 'txn-1' }),
} as never;

/** The agent row, with the fields the read-back diff watches. */
function stageAgent(over: Record<string, unknown> = {}) {
  const update = jest.fn().mockResolvedValue(undefined);
  return {
    id: AGENT_ID,
    agent_name: 'Maya',
    tools_granted: ['draft_marketing_email'],
    autonomy_level: 'observe',
    autonomy_level_set_at: null,
    autonomy_level_source: null,
    enabled: true,
    abac_mode_override: null,
    status: 'active',
    update,
    ...over,
  };
}

function args(over: Record<string, unknown> = {}) {
  return {
    agentId: AGENT_ID,
    toolName: 'send_email',
    capabilityId: CAP,
    approvedBy: ALI,
    proposedBy: 'kalkidan@colaberry.com',
    ...over,
  } as Parameters<typeof grantToolToAgent>[1];
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TOOL_GRANT_APPROVERS = ALI;
  mockResolveHumans.mockResolvedValue([ALI]);
  mockConfirmedIds.mockResolvedValue([CAP]);
  mockAllCapabilities.mockReturnValue([
    // Agent Tools Phase 4: `required_tools` must name the tool being granted, because
    // `tool_not_required_by_capability` refuses a grant the capability never asked for. Without
    // it the permitted-grant cases below would refuse, and every write assertion would be
    // passing for the wrong reason.
    { capability_id: CAP, requirement_validation_state: 'draft', required_tools: ['send_email'] },
  ]);
  mockRegistered.mockReturnValue(['send_email', 'draft_marketing_email']);
  mockGrantFindOrCreate.mockResolvedValue([{ id: 'grant-1' }, true]);
});

afterEach(() => { delete process.env.TOOL_GRANT_APPROVERS; });

describe('PROPERTY 1 — a refused grant writes nothing', () => {
  it.each([
    ['the approver is not configured', () => { process.env.TOOL_GRANT_APPROVERS = 'ram@colaberry.com'; }],
    ['the roster cannot be read', () => { mockResolveHumans.mockRejectedValue(new Error('db down')); }],
    ['the capability is not confirmed', () => { mockConfirmedIds.mockResolvedValue([]); }],
    ['the tool is not registered', () => { mockRegistered.mockReturnValue(['something_else']); }],
  ])('refuses when %s, and records nothing', async (_label, spoil) => {
    const agent = stageAgent();
    mockAgentFindByPk.mockResolvedValue(agent);
    spoil();

    await expect(grantToolToAgent(sequelize, args())).rejects.toBeInstanceOf(ToolGrantRefusedError);
    expect(mockGrantFindOrCreate).not.toHaveBeenCalled();
    expect(agent.update).not.toHaveBeenCalled();
  });

  it('refuses the proposer and writes nothing, even though they are the configured approver', () => {
    mockAgentFindByPk.mockResolvedValue(stageAgent());
    return expect(grantToolToAgent(sequelize, args({ proposedBy: ALI })))
      .rejects.toBeInstanceOf(ToolGrantRefusedError)
      .then(() => { expect(mockGrantFindOrCreate).not.toHaveBeenCalled(); });
  });

  it('carries every reason, so a caller is not told half the truth', async () => {
    mockAgentFindByPk.mockResolvedValue(stageAgent());
    mockConfirmedIds.mockResolvedValue([]);
    mockRegistered.mockReturnValue([]);
    try {
      await grantToolToAgent(sequelize, args());
      throw new Error('should have refused');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolGrantRefusedError);
      const rules = (err as ToolGrantRefusedError).issues.map((i) => i.rule);
      expect(rules).toEqual(expect.arrayContaining([
        'tool_not_registered', 'capability_not_confirmed',
      ]));
    }
  });
});

describe('PROPERTY 2 — a permitted grant writes the record and the column', () => {
  it('records the approver, the tool and the capability', async () => {
    mockAgentFindByPk.mockResolvedValue(stageAgent());
    const result = await grantToolToAgent(sequelize, args());

    expect(result.unchanged).toBe(false);
    expect(result.toolsGranted).toEqual(['draft_marketing_email', 'send_email']);
    const [call] = mockGrantFindOrCreate.mock.calls;
    expect(call[0].defaults).toMatchObject({
      agent_id: AGENT_ID,
      agent_name: 'Maya',
      tool_name: 'send_email',
      capability_id: CAP,
      approved_by_identity: ALI,
    });
  });

  it('updates ONLY tools_granted on the agent row', async () => {
    const agent = stageAgent();
    mockAgentFindByPk.mockResolvedValue(agent);
    await grantToolToAgent(sequelize, args());

    expect(agent.update).toHaveBeenCalledTimes(1);
    const [patch] = agent.update.mock.calls[0];
    expect(Object.keys(patch)).toEqual(['tools_granted']);
  });

  it('locks the agent row inside the transaction', async () => {
    mockAgentFindByPk.mockResolvedValue(stageAgent());
    await grantToolToAgent(sequelize, args());
    const [, options] = mockAgentFindByPk.mock.calls[0];
    expect(options.lock).toBe(Transaction.LOCK.UPDATE);
    expect(options.transaction).toEqual({ id: 'txn-1' });
  });

  it('is idempotent: a tool already held records no new row and updates nothing', async () => {
    const agent = stageAgent({ tools_granted: ['send_email'] });
    mockAgentFindByPk.mockResolvedValue(agent);
    mockGrantFindOrCreate.mockResolvedValue([{ id: 'grant-1' }, false]);

    const result = await grantToolToAgent(sequelize, args());
    expect(result.unchanged).toBe(true);
    expect(agent.update).not.toHaveBeenCalled();
  });

  it('reads tools_granted when jsonb handed back a JSON STRING rather than an array', async () => {
    // The column is jsonb and `agentEmailTool` documents that it may be an array, a string or
    // null depending on who wrote it last. Treating a string as empty would silently drop every
    // tool the agent already had.
    mockAgentFindByPk.mockResolvedValue(stageAgent({
      tools_granted: JSON.stringify(['draft_marketing_email']),
    }));
    const result = await grantToolToAgent(sequelize, args());
    expect(result.toolsGranted).toEqual(['draft_marketing_email', 'send_email']);
  });
});

describe('PROPERTY 3 — the read-back diff, in the production path', () => {
  it('throws and rolls back when autonomy_level moved during the grant', async () => {
    // The post-read returns a row whose autonomy level has changed. Nothing in this service
    // does that — the point is that if a later edit, a hook or a trigger did, the grant fails
    // rather than committing a silent widening.
    const before = stageAgent();
    const after = stageAgent({ autonomy_level: 'communicate' });
    mockAgentFindByPk
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);

    await expect(grantToolToAgent(sequelize, args()))
      .rejects.toBeInstanceOf(ToolGrantTouchedMoreThanToolsError);
  });

  it('names exactly which fields moved', async () => {
    mockAgentFindByPk
      .mockResolvedValueOnce(stageAgent())
      .mockResolvedValueOnce(stageAgent({ enabled: false, abac_mode_override: 'enforce' }));
    try {
      await grantToolToAgent(sequelize, args());
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolGrantTouchedMoreThanToolsError);
      expect((err as ToolGrantTouchedMoreThanToolsError).changed.sort())
        .toEqual(['abac_mode_override', 'enabled']);
    }
  });

  it('does NOT throw when only tools_granted differs, which is the whole point', async () => {
    // The positive control for the diff. A check that fired on every grant would be
    // indistinguishable from a broken feature, and a check that never fired would be decoration.
    mockAgentFindByPk
      .mockResolvedValueOnce(stageAgent())
      .mockResolvedValueOnce(stageAgent({ tools_granted: ['draft_marketing_email', 'send_email'] }));
    await expect(grantToolToAgent(sequelize, args())).resolves.toMatchObject({ unchanged: false });
  });
});
