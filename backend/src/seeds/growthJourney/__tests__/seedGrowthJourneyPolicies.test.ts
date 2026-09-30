const resolveBrand = jest.fn();
const policyFindOne = jest.fn();
const policyCreate = jest.fn();
const policyUpdate = jest.fn();

jest.mock('../../../modules/tenancy/tenantResolver', () => ({
  resolveBrandBySlug: (...a: unknown[]) => resolveBrand(...a),
}));

jest.mock('../../../models', () => ({
  GrowthJourneyPolicy: {
    findOne: (...a: unknown[]) => policyFindOne(...a),
    create: (...a: unknown[]) => policyCreate(...a),
    update: (...a: unknown[]) => policyUpdate(...a),
  },
}));

import { seedGrowthJourneyPolicies } from '../seedGrowthJourneyPolicies';
import { DEFAULT_SLA_HOURS, INERT_ON_CREATE, POLICY_BRANDS, QUEUE_POLICY_DEFINITIONS } from '../policyDefinitions';
import { OWNER_QUEUES } from '../../../models/GrowthJourneyHandoff';
import { JOURNEY_PROGRAMS } from '../journeyProgramDefinitions';

/**
 * T403 — the queue policy seed's two obligations: 24 rows once, and never an
 * operator's number overwritten. The update path is asserted EMPTY: a second
 * run against rows the operator has edited touches nothing.
 */

const brandFor = (tenant: string, brand: string) => ({ id: `brand-${brand}`, tenant_id: `tenant-${tenant}` });

beforeEach(() => {
  resolveBrand.mockReset().mockImplementation(async (t: string, b: string) => brandFor(t, b));
  policyFindOne.mockReset().mockResolvedValue(null);
  policyCreate.mockReset().mockImplementation(async (row: Record<string, unknown>) => ({ id: 'pol-new', ...row }));
  policyUpdate.mockReset();
});

const payloads = () => policyCreate.mock.calls.map((c) => c[0] as Record<string, unknown>);

describe('the definitions', () => {
  it('are six queues × four programme brands = 24, every one unique on (brand, queue)', () => {
    expect(OWNER_QUEUES).toHaveLength(6);
    expect(POLICY_BRANDS).toHaveLength(4);
    expect(QUEUE_POLICY_DEFINITIONS).toHaveLength(24);
    const keys = QUEUE_POLICY_DEFINITIONS.map((d) => `${d.tenant_slug}/${d.brand_slug}:${d.owner_queue}`);
    expect(new Set(keys).size).toBe(24);
  });

  it('the brands are exactly the four programme brands, taken from the programme definitions rather than restated', () => {
    expect(POLICY_BRANDS).toEqual(JOURNEY_PROGRAMS.map((p) => ({ tenant_slug: p.tenant_slug, brand_slug: p.brand_slug })));
    expect(POLICY_BRANDS.map((b) => b.brand_slug).sort()).toEqual(['ai-flotation', 'colaberry-enterprise', 'colaberry-training', 'cpn']);
  });

  it('every SLA default is a positive integer number of hours, one per queue, pinned', () => {
    expect(DEFAULT_SLA_HOURS).toEqual({ admissions: 24, sales: 24, solution_architect: 48, support: 8, ali: 72, human_review: 48 });
    for (const d of QUEUE_POLICY_DEFINITIONS) expect(d.sla_hours).toBe(DEFAULT_SLA_HOURS[d.owner_queue]);
  });

  it('INERT_ON_CREATE seeds no capacity, no assignee and no cooldown — NULL means "nobody has said"', () => {
    expect(INERT_ON_CREATE).toEqual({ daily_capacity: null, assigned_to_type: null, assigned_to_id: null, cooldown_days: null, settings: {}, status: 'active' });
  });
});

describe('the seed is idempotent and inert on re-run', () => {
  it('creates 24 rows on an empty database, each queue_capacity, daily_capacity NULL, sla_hours the default', async () => {
    const r = await seedGrowthJourneyPolicies();
    expect(r).toEqual({ created: 24, existing: 0, skipped_brands: [], failed: [] });
    expect(payloads()).toHaveLength(24);
    for (const p of payloads()) {
      expect(p.policy_type).toBe('queue_capacity');
      expect(p.daily_capacity).toBeNull();
      expect(p.assigned_to_id).toBeNull();
      expect(p.sla_hours).toBe(DEFAULT_SLA_HOURS[p.owner_queue as keyof typeof DEFAULT_SLA_HOURS]);
      expect(p.status).toBe('active');
    }
    // Tenant and brand ids come from the resolved brand, never from the definition.
    expect(payloads().find((p) => p.owner_queue === 'sales' && p.brand_id === 'brand-ai-flotation')).toMatchObject({ tenant_id: 'tenant-ai-flotation' });
  });

  it('looks each row up by (brand, queue_capacity, queue) — the unique index\'s own key', async () => {
    await seedGrowthJourneyPolicies();
    expect(policyFindOne.mock.calls[0][0]).toEqual({ where: { brand_id: 'brand-cpn', policy_type: 'queue_capacity', owner_queue: 'admissions' } });
  });

  it('a second run creates nothing and updates nothing — including rows the operator has edited', async () => {
    policyFindOne.mockImplementation(async ({ where }: { where: { owner_queue: string } }) => ({
      id: `pol-${where.owner_queue}`,
      daily_capacity: 5,
      sla_hours: 1,
      assigned_to_type: 'org_member',
      assigned_to_id: 'om-9',
      status: 'paused',
      update: policyUpdate,
    }));
    const r = await seedGrowthJourneyPolicies();
    expect(r).toEqual({ created: 0, existing: 24, skipped_brands: [], failed: [] });
    expect(policyCreate).not.toHaveBeenCalled();
    expect(policyUpdate).not.toHaveBeenCalled();
  });

  it('twice from empty is one create per row: the second run sees the first run\'s rows', async () => {
    const store = new Map<string, Record<string, unknown>>();
    policyFindOne.mockImplementation(async ({ where }: { where: { brand_id: string; owner_queue: string } }) => store.get(`${where.brand_id}:${where.owner_queue}`) ?? null);
    policyCreate.mockImplementation(async (row: Record<string, unknown>) => {
      store.set(`${row.brand_id}:${row.owner_queue}`, row);
      return row;
    });
    const first = await seedGrowthJourneyPolicies();
    const second = await seedGrowthJourneyPolicies();
    expect(first.created).toBe(24);
    expect(second).toEqual({ created: 0, existing: 24, skipped_brands: [], failed: [] });
    expect(policyCreate).toHaveBeenCalledTimes(24);
    expect(store.size).toBe(24);
  });
});

describe('failure isolation', () => {
  it('a brand absent from this database is skipped, not failed, and its six rows are not attempted', async () => {
    resolveBrand.mockImplementation(async (t: string, b: string) => (b === 'ai-flotation' ? null : brandFor(t, b)));
    const r = await seedGrowthJourneyPolicies();
    expect(r.created).toBe(18);
    expect(r.skipped_brands).toEqual(['ai-flotation/ai-flotation']);
    expect(r.failed).toEqual([]);
    // Resolved once per brand, not once per row.
    expect(resolveBrand).toHaveBeenCalledTimes(4);
  });

  it('two containers booting at once: the loser of the unique index counts the row as existing, not failed', async () => {
    policyCreate.mockImplementation(async (row: Record<string, unknown>) => {
      if (row.owner_queue === 'ali' && row.brand_id === 'brand-cpn') throw Object.assign(new Error('duplicate key'), { name: 'SequelizeUniqueConstraintError' });
      return row;
    });
    const r = await seedGrowthJourneyPolicies();
    expect(r).toEqual({ created: 23, existing: 1, skipped_brands: [], failed: [] });
  });

  it('one row failing is recorded by name and does not stop the other 23', async () => {
    policyCreate.mockImplementation(async (row: Record<string, unknown>) => {
      if (row.owner_queue === 'support' && row.brand_id === 'brand-cpn') throw new Error('disk full');
      return row;
    });
    const r = await seedGrowthJourneyPolicies();
    expect(r.created).toBe(23);
    expect(r.failed).toEqual([{ target: 'cpn/cpn:support', error: 'disk full' }]);
  });
});
