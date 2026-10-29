const mockFindByPk = jest.fn();
jest.mock('../../../models/AiAgent', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockFindByPk(...a) },
}));

const mockLoadMyDomains = jest.fn();
const mockResolveOwnerIdentityIds = jest.fn();
jest.mock('../agentDomainProvisionedReader', () => ({
  __esModule: true,
  loadMyDomains: (...a: any[]) => mockLoadMyDomains(...a),
  resolveOwnerIdentityIds: (...a: any[]) => mockResolveOwnerIdentityIds(...a),
}));

import {
  setAgentDisplayName,
  AgentNotYoursError,
  AgentDisplayNameTakenError,
} from '../agentDisplayNameService';

/**
 * AF10.6 service. The properties worth the most here:
 *
 *  - A DISABLED agent still reserves its name. Production holds `Maya` at `enabled: false` and
 *    Maya is the name the admissions builder chose, so an `enabled` filter in the collision query
 *    would allow exactly the one name this ticket exists to refuse. Two tests guard it: one
 *    behavioural, one that reads the SQL.
 *  - Self-exclusion, because Ruth's agent row IS the Dara row, so "Dara" must be ALLOWED while
 *    "Maya" is refused. Getting this backwards breaks one case or the other.
 *  - Ownership is checked before anything is read or disclosed.
 *  - The config merge preserves keys and survives a null config.
 *  - Setting the same name twice writes nothing.
 *
 * `sequelize` is a parameter of the service rather than an import, so these tests inject a fake
 * instead of mocking a module boundary. `query` is the collision check; it is called twice on a
 * successful save (once before the transaction, once inside it).
 */

const MINE = 'agent-mine-0000-0000-0000-000000000001';

/** A fake sequelize whose `query` returns the given collision rows, in order. */
function fakeSequelize(...collisionResults: any[][]) {
  const query = jest.fn();
  collisionResults.forEach((rows) => query.mockResolvedValueOnce(rows));
  query.mockResolvedValue([]);
  return {
    query,
    transaction: (fn: any) => fn('TX'),
  } as any;
}

function fakeAgent(config: Record<string, unknown> | null = {}) {
  return { id: MINE, config, update: jest.fn().mockResolvedValue(undefined) };
}

/** The collision query text, as the service actually built it. */
function sqlOf(sequelize: any): string {
  return String(sequelize.query.mock.calls[0][0]);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveOwnerIdentityIds.mockResolvedValue([]);
  mockLoadMyDomains.mockResolvedValue([{ domain_key: 'curriculum', agent_id: MINE }]);
});

describe('setAgentDisplayName', () => {
  it('stores the name on config.display_name', async () => {
    const agent = fakeAgent({});
    mockFindByPk.mockResolvedValue(agent);
    const sequelize = fakeSequelize([], []);

    const r = await setAgentDisplayName(sequelize, 'ruth@example.com', MINE, 'Dara');

    expect(r).toEqual({ agent_id: MINE, display_name: 'Dara', unchanged: false });
    expect(agent.update).toHaveBeenCalledWith(
      { config: { display_name: 'Dara' } },
      { transaction: 'TX' },
    );
  });

  it('preserves unrelated config keys', async () => {
    const agent = fakeAgent({ department_slug: 'curriculum', max_posts_per_run: 3 });
    mockFindByPk.mockResolvedValue(agent);

    await setAgentDisplayName(fakeSequelize([], []), 'ruth@example.com', MINE, 'Dara');

    expect(agent.update).toHaveBeenCalledWith(
      { config: { department_slug: 'curriculum', max_posts_per_run: 3, display_name: 'Dara' } },
      { transaction: 'TX' },
    );
  });

  it('does not throw on a row whose config is null', async () => {
    const agent = fakeAgent(null);
    mockFindByPk.mockResolvedValue(agent);

    await expect(
      setAgentDisplayName(fakeSequelize([], []), 'ruth@example.com', MINE, 'Dara'),
    ).resolves.toMatchObject({ display_name: 'Dara' });
    expect(agent.update).toHaveBeenCalledWith(
      { config: { display_name: 'Dara' } },
      { transaction: 'TX' },
    );
  });

  it('IDEMPOTENT: setting the same name twice writes nothing the second time', async () => {
    const agent = fakeAgent({ display_name: 'Dara' });
    mockFindByPk.mockResolvedValue(agent);

    const r = await setAgentDisplayName(fakeSequelize([], []), 'ruth@example.com', MINE, 'Dara');

    expect(r).toEqual({ agent_id: MINE, display_name: 'Dara', unchanged: true });
    expect(agent.update).not.toHaveBeenCalled();
  });

  it('403s when the agent is not one the caller builds', async () => {
    mockLoadMyDomains.mockResolvedValue([{ domain_key: 'platform', agent_id: 'someone-else' }]);
    const sequelize = fakeSequelize([]);

    await expect(
      setAgentDisplayName(sequelize, 'quincy@example.com', MINE, 'Ellis'),
    ).rejects.toBeInstanceOf(AgentNotYoursError);

    // Nothing was read and no name was disclosed.
    expect(sequelize.query).not.toHaveBeenCalled();
    expect(mockFindByPk).not.toHaveBeenCalled();
  });

  it('403s when the caller owns no domain at all', async () => {
    mockLoadMyDomains.mockResolvedValue([]);
    await expect(
      setAgentDisplayName(fakeSequelize([]), 'stranger@example.com', MINE, 'Ellis'),
    ).rejects.toBeInstanceOf(AgentNotYoursError);
  });

  it('409s when another agent already holds the name', async () => {
    mockFindByPk.mockResolvedValue(fakeAgent({}));
    const sequelize = fakeSequelize([{ source: 'agent_name', name: 'Maya' }]);

    const err = await setAgentDisplayName(sequelize, 'kalkidan@example.com', MINE, 'Maya')
      .catch((e) => e);

    expect(err).toBeInstanceOf(AgentDisplayNameTakenError);
    expect(err.takenName).toBe('Maya');
    expect(err.source).toBe('agent_name');
    expect(err.message).toContain('Maya');
  });

  it('THE MAYA CASE: 409s even though the colliding agent is disabled', async () => {
    // Production, 2026-10-28: agent_name 'Maya' exists with enabled:false, and Maya is the name
    // the admissions builder chose. A disabled row still owns its name.
    mockFindByPk.mockResolvedValue(fakeAgent({}));
    const sequelize = fakeSequelize([{ source: 'agent_name', name: 'Maya' }]);

    await expect(
      setAgentDisplayName(sequelize, 'kalkidan@example.com', MINE, 'Maya'),
    ).rejects.toBeInstanceOf(AgentDisplayNameTakenError);
  });

  it('THE MAYA CASE, structurally: the collision query filters on no enabled flag', async () => {
    // This is the test that kills a `WHERE enabled = true` implementation, which would pass every
    // behavioural test above if its fixtures only ever held enabled rows.
    mockFindByPk.mockResolvedValue(fakeAgent({}));
    const sequelize = fakeSequelize([], []);
    await setAgentDisplayName(sequelize, 'ruth@example.com', MINE, 'Dara');

    expect(sqlOf(sequelize)).not.toMatch(/enabled/i);
  });

  it("THE DARA CASE: a name matching the agent's OWN row is allowed", async () => {
    // Ruth chose "Dara" and her agent row IS the Dara row, so the collision is with itself.
    // The query excludes self, so no collision row comes back and the save proceeds.
    const agent = fakeAgent({});
    mockFindByPk.mockResolvedValue(agent);
    const sequelize = fakeSequelize([], []);

    await expect(
      setAgentDisplayName(sequelize, 'ruth@example.com', MINE, 'Dara'),
    ).resolves.toMatchObject({ display_name: 'Dara', unchanged: false });

    // Self-exclusion is in the SQL and bound to this agent's id.
    expect(sqlOf(sequelize)).toContain('<> $1');
    expect(sequelize.query.mock.calls[0][1].bind[0]).toBe(MINE);
  });

  it('checks all four places a name can already be spoken for', async () => {
    mockFindByPk.mockResolvedValue(fakeAgent({}));
    const sequelize = fakeSequelize([], []);
    await setAgentDisplayName(sequelize, 'ruth@example.com', MINE, 'Dara');

    const sql = sqlOf(sequelize);
    expect(sql).toContain('a.agent_name');
    expect(sql).toContain("config->>'display_name'");
    expect(sql).toContain("config->>'agent_name'");
    expect(sql).toContain('admin_users');
  });

  it('409s on a collision with the name the platform actually renders (admin_users.display_name)', async () => {
    mockFindByPk.mockResolvedValue(fakeAgent({}));
    const sequelize = fakeSequelize([{ source: 'admin_display_name', name: 'Product Experience Agent' }]);

    const err = await setAgentDisplayName(sequelize, 'mihret@example.com', MINE, 'Product Experience Agent')
      .catch((e) => e);

    expect(err).toBeInstanceOf(AgentDisplayNameTakenError);
    expect(err.source).toBe('admin_display_name');
  });

  it('normalizes the name before comparing, so "  Maya  " and "MAYA" reach the same check', async () => {
    mockFindByPk.mockResolvedValue(fakeAgent({}));
    const sequelize = fakeSequelize([], []);
    await setAgentDisplayName(sequelize, 'ruth@example.com', MINE, '  Dara  ');

    // The service trims before binding...
    expect(sequelize.query.mock.calls[0][1].bind[1]).toBe('Dara');
    // ...and the comparison case-folds and trims BOTH sides, which is what makes "MAYA" collide.
    const sql = sqlOf(sequelize);
    expect(sql).toContain('lower(btrim(');
    expect(sql.match(/lower\(btrim\(/g)!.length).toBeGreaterThanOrEqual(8);
  });

  it('stores the trimmed name, not the padded one', async () => {
    const agent = fakeAgent({});
    mockFindByPk.mockResolvedValue(agent);

    const r = await setAgentDisplayName(fakeSequelize([], []), 'ruth@example.com', MINE, '  Dara  ');

    expect(r.display_name).toBe('Dara');
    expect(agent.update).toHaveBeenCalledWith(
      { config: { display_name: 'Dara' } },
      { transaction: 'TX' },
    );
  });

  it('re-checks for a collision INSIDE the transaction, and refuses if one appeared', async () => {
    // First check clean, second check dirty: somebody took the name in between.
    mockFindByPk.mockResolvedValue(fakeAgent({}));
    const sequelize = fakeSequelize([], [{ source: 'display_name', name: 'Ava' }]);

    await expect(
      setAgentDisplayName(sequelize, 'sarbjit@example.com', MINE, 'Ava'),
    ).rejects.toBeInstanceOf(AgentDisplayNameTakenError);

    expect(sequelize.query).toHaveBeenCalledTimes(2);
    // The second check runs in the transaction, or it is not a re-check.
    expect(sequelize.query.mock.calls[1][1].transaction).toBe('TX');
  });

  it('403s rather than crashing when the row vanishes between the ownership check and the read', async () => {
    mockFindByPk.mockResolvedValue(null);

    await expect(
      setAgentDisplayName(fakeSequelize([], []), 'ruth@example.com', MINE, 'Dara'),
    ).rejects.toBeInstanceOf(AgentNotYoursError);
  });
});
