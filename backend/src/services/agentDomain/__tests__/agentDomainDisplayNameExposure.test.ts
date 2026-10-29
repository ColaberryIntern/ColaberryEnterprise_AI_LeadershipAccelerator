import { loadProvisionedDomainsForBuilder } from '../agentDomainProvisionedReader';

/**
 * AF10.6, reader half. The properties worth the most here:
 *
 *  - the agent's chosen name is SELECTed and reaches the caller, because a name stored and never
 *    returned is a name nobody can see, which is the whole feature failing quietly
 *  - it comes from a LEFT JOIN, so an unnamed agent and a domain with no agent at all both
 *    produce null rather than dropping the domain row out of the result
 *
 * The SQL assertions read the query the reader actually built. That is the only way to pin SQL
 * shape without a live Postgres, and it is what catches the column being renamed or the join
 * being dropped while every mocked row keeps returning a value.
 */

function fakeSequelize(...results: any[][]) {
  const query = jest.fn();
  results.forEach((rows) => query.mockResolvedValueOnce(rows));
  query.mockResolvedValue([]);
  return { query } as any;
}

const DOMAIN_ROW = {
  domain_key: 'curriculum',
  student_project_id: 'proj-1',
  anchor_id: 'anchor-1',
  stage: 'provisioned',
  entry_point: null,
  manager_identity_id: null,
  manager_email: null,
  manager_can_reach: null,
  manager_blocker: null,
  intended_builder_state: 'named',
  agent_id: 'agent-1',
  agent_display_name: 'Dara',
  releases: 3,
  stories: 50,
  stories_verified: 0,
  build_authorizations: 0,
};

describe('the reader exposes the agent display name', () => {
  it('returns the name the intern chose', async () => {
    const sequelize = fakeSequelize([{ display_name: 'Ruth Kumera' }], [DOMAIN_ROW]);

    const rows = await loadProvisionedDomainsForBuilder(sequelize, 'ruth@example.com');

    expect(rows).toHaveLength(1);
    expect(rows[0].agent_display_name).toBe('Dara');
  });

  it('selects the name from the agent config under the expected alias', async () => {
    const sequelize = fakeSequelize([{ display_name: 'Ruth Kumera' }], [DOMAIN_ROW]);
    await loadProvisionedDomainsForBuilder(sequelize, 'ruth@example.com');

    // The second call is the domain query; the first resolved the builder's name.
    const sql = String(sequelize.query.mock.calls[1][0]);
    expect(sql).toContain("config->>'display_name'");
    expect(sql).toContain('agent_display_name');
  });

  it('joins the agent with a LEFT JOIN, so a domain with no agent still returns', async () => {
    const sequelize = fakeSequelize([{ display_name: 'Ruth Kumera' }], [DOMAIN_ROW]);
    await loadProvisionedDomainsForBuilder(sequelize, 'ruth@example.com');

    const sql = String(sequelize.query.mock.calls[1][0]);
    expect(sql).toMatch(/LEFT JOIN ai_agents\s+aa\s+ON\s+aa\.id\s*=\s*adp\.agent_id/i);
  });

  it('passes a null name through rather than inventing one', async () => {
    const sequelize = fakeSequelize(
      [{ display_name: 'Quincy Nkwain Ninying' }],
      [{ ...DOMAIN_ROW, domain_key: 'platform', agent_display_name: null }],
    );

    const rows = await loadProvisionedDomainsForBuilder(sequelize, 'quincy@example.com');

    expect(rows[0].agent_display_name).toBeNull();
  });
});
