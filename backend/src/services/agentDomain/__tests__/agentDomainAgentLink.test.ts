/**
 * Linking a domain project to its employee -- Phase 1 item 3.
 *
 * The risk here is not that the UPDATE fails. It is that it does MORE than it says: repoints an
 * agent somebody set by hand, reaches another tenant's row, or grants something on the way past.
 * Each of those has a real precedent in this subtree, so each has a test.
 *
 * Mocks dispatch on the SQL TEXT, never on call order. A mock keyed on call order is a mock that
 * breaks the moment a statement is added -- which is exactly how
 * `ensureAgentDomainChangeRequestSchema`'s suite reported a schema failure that did not exist.
 */
const mockResolveTenant = jest.fn();

jest.mock('../agentDomainProvisioner', () => ({
  resolveTenantId: (...a: any[]) => mockResolveTenant(...a),
}));
jest.mock('../../agentBlueprint/agentIdentitySeed', () => ({ seedAgentIdentity: jest.fn() }));
jest.mock('../../../models/AiAgent', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { agentNameByDomainKey, linkDomainAgents } from '../agentDomainAgentLink';
import { DOMAIN_AGENT_ENTRIES } from '../../agentRegistry/domainAgents';
import { AGENT_DOMAIN_KEYS } from '../agentDomainRegistry';

const TENANT = 'tenant-colaberry';

/**
 * Statements that WRITE, which is the only thing the no-UPDATE assertions mean.
 *
 * `sql.includes('UPDATE')` was the first version of this and it matched the `FOR UPDATE` on the
 * anchor SELECT, so "issues no UPDATE" failed against correct code. A substring test for a SQL
 * keyword has to anchor on the statement, not on the word.
 */
const writesIn = (calls: Array<{ sql: string }>) =>
  calls.filter((c) => /^\s*(INSERT|UPDATE|DELETE)\s/i.test(c.sql));

interface Stage {
  /** `agent_domain_projects` rows, by domain key. Absent key means no anchor. */
  readonly anchors: Record<string, { id: string; agent_id: string | null }>;
  /** `ai_agents` rows, by agent name. A list so "two rows share the name" is expressible. */
  readonly agents: Record<string, Array<{ id: string }>>;
  /** Override what the UPDATE's RETURNING yields, to prove the outcome is read from it. */
  readonly updateReturns?: Array<{ id: string }>;
}

function fakeSequelize(stage: Stage) {
  const calls: Array<{ sql: string; bind: any[] }> = [];
  const query = jest.fn(async (sql: string, opts: any) => {
    calls.push({ sql, bind: opts?.bind ?? [] });
    const s = String(sql);
    if (s.includes('FROM agent_domain_projects')) {
      const row = stage.anchors[opts.bind[0]];
      return row ? [row] : [];
    }
    if (s.includes('FROM ai_agents')) {
      return stage.agents[opts.bind[0]] ?? [];
    }
    if (s.includes('UPDATE agent_domain_projects')) {
      if (stage.updateReturns) return stage.updateReturns;
      return [{ id: stage.anchors[opts.bind[0]].id }];
    }
    throw new Error(`unexpected SQL: ${s.slice(0, 60)}`);
  });
  return {
    sequelize: { query, transaction: async (fn: any) => fn({}) } as any,
    calls,
    query,
  };
}

/** One domain staged as fully ready to link. */
const readyFor = (domainKey: string, agentName: string): Stage => ({
  anchors: { [domainKey]: { id: `anchor-${domainKey}`, agent_id: null } },
  agents: { [agentName]: [{ id: `ai-${domainKey}` }] },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveTenant.mockResolvedValue(TENANT);
});

describe('agentNameByDomainKey', () => {
  it('maps every registered domain agent, with no key collisions', () => {
    const m = agentNameByDomainKey();
    expect(m.size).toBe(DOMAIN_AGENT_ENTRIES.length);
    for (const e of DOMAIN_AGENT_ENTRIES) {
      expect([...m.values()]).toContain(e.agent_name);
    }
  });

  it('derives the key from the registry name rather than a second hand-written table', () => {
    // `MarketingDomainAgent` -> `marketing`, `ProductExperienceDomainAgent` ->
    // `product_experience`. Inverted from the registry so renaming an agent moves both.
    const m = agentNameByDomainKey();
    expect(m.get('marketing')).toBe('MarketingDomainAgent');
    expect(m.get('product_experience')).toBe('ProductExperienceDomainAgent');
  });
});

describe('linkDomainAgents', () => {
  it('fills a NULL agent_id and reports it as linked', async () => {
    const name = agentNameByDomainKey().get('marketing')!;
    const { sequelize } = fakeSequelize(readyFor('marketing', name));

    const res = await linkDomainAgents(sequelize);
    const marketing = res.find((r) => r.domain_key === 'marketing')!;

    expect(marketing.outcome).toBe('linked');
    expect(marketing.agent_id).toBe('ai-marketing');
  });

  it('NEVER repoints an existing link, and issues no UPDATE for one', async () => {
    // `learner_success` is the real case: the registry already points it at Reese, AND it has its
    // own `LearnerSuccessDomainAgent` row. A function that could repoint would hand that domain a
    // different employee than the one its manager has been working with.
    const name = agentNameByDomainKey().get('learner_success')!;
    const { sequelize, calls } = fakeSequelize({
      anchors: { learner_success: { id: 'anchor-ls', agent_id: 'reese-existing' } },
      agents: { [name]: [{ id: 'ai-would-be-wrong' }] },
    });

    const res = await linkDomainAgents(sequelize);
    const ls = res.find((r) => r.domain_key === 'learner_success')!;

    expect(ls.outcome).toBe('already_linked');
    expect(ls.agent_id).toBe('reese-existing');
    expect(writesIn(calls)).toHaveLength(0);
  });

  it('reports no_registry_entry for curriculum rather than omitting it', async () => {
    // `domainAgents.ts` has nine entries, not ten: curriculum's employee is Dara, who predates
    // the Agent Factory. A loop over the agent registry would cover nine domains and the report
    // would read as ten clean ones.
    const { sequelize } = fakeSequelize({ anchors: {}, agents: {} });

    const res = await linkDomainAgents(sequelize);
    const curriculum = res.find((r) => r.domain_key === 'curriculum')!;

    expect(curriculum).toBeDefined();
    expect(curriculum.outcome).toBe('no_registry_entry');
    expect(curriculum.agent_name).toBeNull();
  });

  it('reports no_anchor when the domain has no agent_domain_projects row', async () => {
    const { sequelize } = fakeSequelize({ anchors: {}, agents: {} });

    const res = await linkDomainAgents(sequelize);

    // Nine `no_anchor`, plus curriculum which never had an agent name to resolve.
    expect(res.filter((r) => r.outcome === 'no_anchor')).toHaveLength(DOMAIN_AGENT_ENTRIES.length);
    expect(res.filter((r) => r.outcome === 'no_registry_entry')).toHaveLength(1);
    expect(res.every((r) => r.agent_id === null)).toBe(true);
  });

  it('reports no_agent_row rather than inventing an id when the agent is not registered', async () => {
    const { sequelize } = fakeSequelize({
      anchors: { marketing: { id: 'anchor-marketing', agent_id: null } },
      agents: {},
    });

    const res = await linkDomainAgents(sequelize);
    const marketing = res.find((r) => r.domain_key === 'marketing')!;

    expect(marketing.outcome).toBe('no_agent_row');
    expect(marketing.agent_id).toBeNull();
  });

  it('REFUSES TO GUESS when two ai_agents rows share the name', async () => {
    // `agent_name` being the unique link is the assumption the whole function rests on. If it
    // stops being true, taking the first row is a coin flip that writes a foreign key.
    const name = agentNameByDomainKey().get('marketing')!;
    const { sequelize, calls } = fakeSequelize({
      anchors: { marketing: { id: 'anchor-marketing', agent_id: null } },
      agents: { [name]: [{ id: 'ai-a' }, { id: 'ai-b' }] },
    });

    const res = await linkDomainAgents(sequelize);

    expect(res.find((r) => r.domain_key === 'marketing')!.outcome).toBe('no_agent_row');
    expect(writesIn(calls)).toHaveLength(0);
  });

  it('reads the outcome from RETURNING, not from having submitted an UPDATE', async () => {
    // A statement that matched nothing still ran. Reporting the input as the result is the
    // mistake the provisioner's own header calls out by name.
    const name = agentNameByDomainKey().get('marketing')!;
    const { sequelize } = fakeSequelize({ ...readyFor('marketing', name), updateReturns: [] });

    const res = await linkDomainAgents(sequelize);

    expect(res.find((r) => r.domain_key === 'marketing')!.outcome).toBe('already_linked');
  });

  it('every statement against agent_domain_projects is TENANT-SCOPED', async () => {
    // `uq_agent_domain_key` is on (tenant_id, domain_key), so a domain key is not unique alone.
    // The sibling reconcile shipped without this predicate and a verifier reproduced it
    // clobbering a second tenant's row.
    const name = agentNameByDomainKey().get('marketing')!;
    const { sequelize, calls } = fakeSequelize(readyFor('marketing', name));

    await linkDomainAgents(sequelize);

    const anchorStatements = calls.filter((c) => c.sql.includes('agent_domain_projects'));
    expect(anchorStatements.length).toBeGreaterThan(0);
    for (const c of anchorStatements) {
      expect(c.sql).toMatch(/tenant_id = \$2/);
      expect(c.bind).toContain(TENANT);
    }
  });

  it('every UPDATE is scoped to agent_id IS NULL, so it can only ever fill a blank', async () => {
    const name = agentNameByDomainKey().get('marketing')!;
    const { sequelize, calls } = fakeSequelize(readyFor('marketing', name));

    await linkDomainAgents(sequelize);

    const updates = writesIn(calls);
    expect(updates.length).toBeGreaterThan(0);
    for (const c of updates) expect(c.sql).toContain('agent_id IS NULL');
  });

  it('GRANTS NOTHING: no statement mentions enabled, autonomy_level or tools_granted', async () => {
    // A link makes an agent findable from its project. It must not make it able to act.
    const name = agentNameByDomainKey().get('marketing')!;
    const { sequelize, calls } = fakeSequelize(readyFor('marketing', name));

    await linkDomainAgents(sequelize);

    for (const c of calls) {
      expect(c.sql).not.toMatch(/\benabled\b/);
      expect(c.sql).not.toMatch(/\bautonomy_level\b/);
      expect(c.sql).not.toMatch(/\btools_granted\b/);
    }
  });

  it('writes to no table but agent_domain_projects', async () => {
    const name = agentNameByDomainKey().get('marketing')!;
    const { sequelize, calls } = fakeSequelize(readyFor('marketing', name));

    await linkDomainAgents(sequelize);

    for (const c of writesIn(calls)) {
      expect(c.sql).toContain('agent_domain_projects');
    }
  });

  it('IDEMPOTENT: the state left by one run makes the next run a no-op', async () => {
    const name = agentNameByDomainKey().get('marketing')!;
    const first = fakeSequelize(readyFor('marketing', name));
    await linkDomainAgents(first.sequelize);

    // Second run against the post-state: agent_id is now set.
    const second = fakeSequelize({
      anchors: { marketing: { id: 'anchor-marketing', agent_id: 'ai-marketing' } },
      agents: { [name]: [{ id: 'ai-marketing' }] },
    });
    const res = await linkDomainAgents(second.sequelize);

    expect(res.find((r) => r.domain_key === 'marketing')!.outcome).toBe('already_linked');
    expect(writesIn(second.calls)).toHaveLength(0);
  });

  it('covers all TEN domains in one pass, with one row per domain', async () => {
    // Ten, not nine. The agent registry has nine entries and a report that covered only those
    // would read as a complete sweep while leaving one domain unexamined.
    const { sequelize } = fakeSequelize({ anchors: {}, agents: {} });

    const res = await linkDomainAgents(sequelize);

    expect(res).toHaveLength(AGENT_DOMAIN_KEYS.length);
    expect(res).toHaveLength(DOMAIN_AGENT_ENTRIES.length + 1);
    expect(new Set(res.map((r) => r.domain_key)).size).toBe(res.length);
    expect(res.map((r) => r.domain_key)).toEqual([...AGENT_DOMAIN_KEYS]);
  });

  it('resolves the tenant exactly once for the whole run', async () => {
    const { sequelize } = fakeSequelize({ anchors: {}, agents: {} });

    await linkDomainAgents(sequelize);

    expect(mockResolveTenant).toHaveBeenCalledTimes(1);
  });
});
