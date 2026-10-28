/**
 * AF2.7 item 3 — the ten agent-domain projects read as titles, not as machine keys.
 *
 * The provisioner wrote `name: plan.domain_key`, so the ten shipped reading `admissions`,
 * `product_experience`, `learner_success` where every other student project carries a real name.
 * Fixing the provisioner does NOT repair them: it creates with `findOrCreate`, which honours
 * `defaults` only when it actually creates, so a re-run is a no-op by design. This script is the
 * repair, and these tests pin the three behaviours that make it safe to run more than once.
 */
import { AGENT_DOMAIN_KEYS, domainProjectName } from '../../services/agentDomain/agentDomainRegistry';
import { derivedProjectId } from '../../services/agentDomain/agentDomainProvisionPlan';

/** The fake `projects` table each case sets up: project id -> current name. */
let rows: Map<string, string | null>;
const updates: Array<{ id: string; name: string; fields?: string[] }> = [];

jest.mock('../../models/Project', () => ({
  __esModule: true,
  default: {
    findByPk: async (id: string) => (rows.has(id) ? { id, name: rows.get(id) } : null),
    update: async (vals: { name: string }, opts: { where: { id: string }; fields?: string[] }) => {
      updates.push({ id: opts.where.id, name: vals.name, fields: opts.fields });
      rows.set(opts.where.id, vals.name);
      return [1];
    },
  },
}));

import { main, planRenames } from '../renameAgentDomainProjects';

const idOf = (key: string) => derivedProjectId(key);
const log: string[] = [];
let spy: jest.SpyInstance;

beforeEach(() => {
  rows = new Map();
  updates.length = 0;
  log.length = 0;
  spy = jest.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { log.push(a.join(' ')); });
});
afterEach(() => { spy.mockRestore(); });

/** Production as measured: all ten rows exist, every one named with its raw key. */
function asShipped(): void {
  for (const k of AGENT_DOMAIN_KEYS) rows.set(idOf(k), k);
}

describe('the names it would write', () => {
  it('uses the registry title for every one of the ten', async () => {
    asShipped();
    const plan = await planRenames();
    expect(plan).toHaveLength(10);
    expect(plan.every((p) => p.action === 'renamed')).toBe(true);
    expect(plan.map((p) => p.to)).toEqual(AGENT_DOMAIN_KEYS.map((k) => domainProjectName(k)));
  });

  it('writes a human title, not a machine key', async () => {
    asShipped();
    await main(['--execute']);
    // No remaining name is snake_case-lower, which is what the defect looked like.
    for (const u of updates) expect(u.name).not.toMatch(/^[a-z]+(_[a-z]+)*$/);
    expect(updates.find((u) => u.id === idOf('product_experience'))?.name).toBe('Product Experience & UI/UX');
  });

  it('agrees exactly with the provisioner, because both call domainProjectName', async () => {
    // If these two ever diverge, a renamed row and a newly provisioned row disagree silently.
    asShipped();
    const plan = await planRenames();
    for (const p of plan) expect(p.to).toBe(domainProjectName(p.domain_key));
  });
});

describe('dry run is the default', () => {
  it('writes nothing without --execute', async () => {
    asShipped();
    await main([]);
    expect(updates).toEqual([]);
    expect(log.join('\n')).toContain('WOULD RENAME');
    expect(log.join('\n')).toContain('Re-run with --execute');
  });

  it('writes with --execute', async () => {
    asShipped();
    await main(['--execute']);
    expect(updates).toHaveLength(10);
    expect(log.join('\n')).toContain('RENAMED');
  });

  it('touches only the name column', async () => {
    asShipped();
    await main(['--execute']);
    for (const u of updates) expect(u.fields).toEqual(['name']);
  });
});

describe('running it twice', () => {
  it('is a no-op the second time', async () => {
    asShipped();
    await main(['--execute']);
    expect(updates).toHaveLength(10);

    updates.length = 0;
    await main(['--execute']);
    expect(updates).toEqual([]);     // the end state is the same, with no second write
    expect(log.join('\n')).toContain('ALREADY CORRECT');
  });
});

describe('a name somebody set on purpose', () => {
  it('is reported and left alone, never overwritten', async () => {
    asShipped();
    rows.set(idOf('marketing'), 'Brand Desk');     // a deliberate human rename
    await main(['--execute']);

    expect(rows.get(idOf('marketing'))).toBe('Brand Desk');
    expect(updates.find((u) => u.id === idOf('marketing'))).toBeUndefined();
    expect(log.join('\n')).toContain('SKIPPED (custom name, left alone)');
    // The other nine are still repaired, so one custom name does not stall the run.
    expect(updates).toHaveLength(9);
  });

  it('treats a NULL name as custom rather than guessing', async () => {
    asShipped();
    rows.set(idOf('sales'), null);
    await main(['--execute']);
    expect(updates.find((u) => u.id === idOf('sales'))).toBeUndefined();
  });
});

describe('a domain with no project row', () => {
  it('is reported, and does not stop the rest', async () => {
    asShipped();
    rows.delete(idOf('executive'));
    await main(['--execute']);
    expect(log.join('\n')).toContain('MISSING (no project row)');
    expect(updates).toHaveLength(9);
  });

  it('writes nothing at all when the table is empty', async () => {
    await main(['--execute']);
    expect(updates).toEqual([]);
  });
});
