import { Op } from 'sequelize';
import {
  listOrganizations,
  getOrganizationDetail,
  setOrganizationStatus,
  addCohortToOrganization,
  removeCohortFromOrganization,
  getOrganizationStats,
} from '../adminOrgService';
import { Organization, OrgMember, OrgCohort, Cohort } from '../../models';
import { sequelize } from '../../config/database';
import { orgReadable } from '../../modules/tenancy/organizationScope';

jest.mock('../../config/database', () => ({
  sequelize: { query: jest.fn(), constructor: { QueryTypes: { SELECT: 'SELECT' } } },
}));

jest.mock('../../models', () => ({
  Organization: { findByPk: jest.fn(), findOne: jest.fn(), findAndCountAll: jest.fn() },
  OrgMember: { findAll: jest.fn() },
  OrgCohort: { findAll: jest.fn(), findOrCreate: jest.fn(), destroy: jest.fn() },
  Cohort: { findByPk: jest.fn() },
  Enrollment: {},
  Lead: { findByPk: jest.fn(), findOne: jest.fn() },
}));

/**
 * Tenant scoping for business accounts (Gate 5, master plan §19.2).
 *
 * The leak this closes: `listOrganizations` was an unfiltered `findAndCountAll` over every
 * row, so a CPN operator listing accounts would have received Colaberry Enterprise's
 * client companies, their owner emails and their headcounts.
 *
 * Every test here asserts on the WHERE CLAUSE actually handed to Sequelize, not on the
 * rows a mock chose to return. A mock returning two rows proves nothing about isolation —
 * it proves the mock was configured. What matters is whether the query could ever have
 * reached another tenant's data.
 */

const CPN = '11111111-1111-4111-8111-111111111111';
const COLABERRY = '22222222-2222-4222-8222-222222222222';

const cpnOnly = { tenantIds: [CPN], crossTenant: false };
const superAdmin = { tenantIds: [], crossTenant: true };
const nobody = { tenantIds: [], crossTenant: false };

const whereOf = (mock: jest.Mock) => (mock.mock.calls[0][0] as { where: Record<string, unknown> }).where;

beforeEach(() => {
  jest.clearAllMocks();
  (Organization.findAndCountAll as jest.Mock).mockResolvedValue({ rows: [], count: 0 });
  (OrgMember.findAll as jest.Mock).mockResolvedValue([]);
  (OrgCohort.findAll as jest.Mock).mockResolvedValue([]);
  (sequelize.query as jest.Mock).mockResolvedValue([{ total: 0, active: 0, suspended: 0, with_cohorts: 0 }]);
});

describe('listing is filtered by tenant, not by hope', () => {
  it('a CPN operator queries with tenant_id restricted to CPN', async () => {
    await listOrganizations({}, cpnOnly);
    expect(whereOf(Organization.findAndCountAll as jest.Mock)).toMatchObject({
      tenant_id: { [Symbol.for('in')]: [CPN] },
    });
  });

  it('a platform superadmin is not restricted', async () => {
    await listOrganizations({}, superAdmin);
    expect(whereOf(Organization.findAndCountAll as jest.Mock).tenant_id).toBeUndefined();
  });

  it('THE ONE THAT MATTERS: a caller authorized for nothing matches nothing, not everything', async () => {
    // If this ever produces an empty clause the endpoint silently becomes a full dump of
    // every tenant's client list. So assert the clause is the deliberately UNSATISFIABLE
    // one, by reading it rather than by checking it is "not empty".
    //
    // Note the clause is built from `Op.and`, a SYMBOL key — `JSON.stringify` drops it and
    // reports `{}` for a perfectly good filter. Any test here that stringifies the where
    // clause is testing nothing.
    await listOrganizations({}, nobody);
    const where = whereOf(Organization.findAndCountAll as jest.Mock);

    const conditions = (where as Record<symbol, unknown>)[Op.and] as Array<Record<string, unknown>>;
    expect(Array.isArray(conditions)).toBe(true);
    // tenant_id IS NULL *and* tenant_id IS NOT NULL — satisfiable by no row that exists.
    expect(conditions).toEqual([
      { tenant_id: null },
      { tenant_id: { [Op.ne]: null } },
    ]);
  });

  it('a status filter narrows the scope and can never widen it', async () => {
    await listOrganizations({ status: 'active' }, cpnOnly);
    const where = whereOf(Organization.findAndCountAll as jest.Mock);
    expect(where).toMatchObject({ status: 'active' });
    expect(where.tenant_id).toBeDefined();
  });

  it('a search term does not drop the tenant filter', async () => {
    await listOrganizations({ search: 'acme' }, cpnOnly);
    expect(whereOf(Organization.findAndCountAll as jest.Mock).tenant_id).toBeDefined();
  });
});

describe('by-id reads are scoped in the QUERY, so the row never leaves the database', () => {
  it('getOrganizationDetail folds the tenant into the lookup', async () => {
    (Organization.findOne as jest.Mock).mockResolvedValue(null);
    await getOrganizationDetail('org-in-another-tenant', cpnOnly);

    const where = whereOf(Organization.findOne as jest.Mock);
    expect(where).toMatchObject({ id: 'org-in-another-tenant' });
    expect(where.tenant_id).toBeDefined();
  });

  it('returns null — which the controller maps to 404, never 403', async () => {
    // 403 on an org that exists in another tenant confirms it exists, turning the
    // endpoint into an id-enumeration oracle. Null is the whole point.
    (Organization.findOne as jest.Mock).mockResolvedValue(null);
    expect(await getOrganizationDetail('someone-elses-org', cpnOnly)).toBeNull();
  });
});

describe('writes are scoped too — reading another tenant is bad, mutating it is worse', () => {
  it('setOrganizationStatus cannot suspend an out-of-scope account', async () => {
    (Organization.findOne as jest.Mock).mockResolvedValue(null);
    expect(await setOrganizationStatus('other-tenant-org', 'suspended', 'ali@colaberry.com', cpnOnly))
      .toBeNull();
    expect(whereOf(Organization.findOne as jest.Mock).tenant_id).toBeDefined();
  });

  it('addCohortToOrganization reports org_not_found — the same answer as a missing org', async () => {
    (Organization.findOne as jest.Mock).mockResolvedValue(null);
    (Cohort.findByPk as jest.Mock).mockResolvedValue({ id: 'coh-1' });
    // Distinguishing "exists but not yours" from "does not exist" would leak which ids
    // belong to another tenant.
    expect(await addCohortToOrganization('other-org', 'coh-1', null, 'a@b.c', cpnOnly))
      .toEqual({ error: 'org_not_found' });
    expect(OrgCohort.findOrCreate).not.toHaveBeenCalled();
  });

  it('removeCohortFromOrganization checks scope BEFORE destroying', async () => {
    // OrgCohort carries no tenant of its own, so a destroy keyed on ids alone would
    // happily unlink another tenant's cohort from another tenant's account.
    (Organization.findOne as jest.Mock).mockResolvedValue(null);
    expect(await removeCohortFromOrganization('other-org', 'coh-1', cpnOnly)).toBe(false);
    expect(OrgCohort.destroy).not.toHaveBeenCalled();
  });

  it('a scoped-in org still performs the delete', async () => {
    (Organization.findOne as jest.Mock).mockResolvedValue({ id: 'org-1' });
    (OrgCohort.destroy as jest.Mock).mockResolvedValue(1);
    expect(await removeCohortFromOrganization('org-1', 'coh-1', cpnOnly)).toBe(true);
    expect(OrgCohort.destroy).toHaveBeenCalled();
  });
});

describe('the stats header cannot count what the list will not show', () => {
  const sqlOf = () => (sequelize.query as jest.Mock).mock.calls[0][0] as string;
  const optsOf = () => (sequelize.query as jest.Mock).mock.calls[0][1] as { replacements: Record<string, unknown> };

  it('binds tenant ids as PARAMETERS, never interpolated into the SQL', async () => {
    await getOrganizationStats(cpnOnly);
    expect(sqlOf()).toContain('WHERE tenant_id IN (:tenantIds)');
    expect(sqlOf()).not.toContain(CPN); // the value itself must not appear in the string
    expect(optsOf().replacements).toEqual({ tenantIds: [CPN] });
  });

  it('an empty scope counts nothing', async () => {
    // A header reading "36 accounts" above a list showing 4 is its own small leak: the
    // total tells you how many rows you are not being shown.
    await getOrganizationStats(nobody);
    expect(sqlOf()).toContain('WHERE false');
  });

  it('a superadmin counts everything', async () => {
    await getOrganizationStats(superAdmin);
    // Not `not.toContain('WHERE')` — the query legitimately uses `FILTER (WHERE ...)` for
    // its per-status counts. What must be absent is a TENANT restriction.
    expect(sqlOf()).not.toContain('WHERE tenant_id');
    expect(sqlOf()).not.toContain('WHERE false');
    expect(optsOf().replacements).toEqual({});
  });
});

describe('orgReadable — the post-load check, for rows already in hand', () => {
  it('allows an org in scope', () => {
    expect(orgReadable(cpnOnly, { tenant_id: CPN })).toBe(true);
  });

  it('refuses an org belonging to another tenant', () => {
    expect(orgReadable(cpnOnly, { tenant_id: COLABERRY })).toBe(false);
  });

  it('refuses an UNCLASSIFIED org to a tenant operator', () => {
    // Organizations have no legacy null population — the backfill classified all of them
    // (6 of 6 in production). A null tenant_id is therefore an anomaly, and the safe
    // reading of "I do not know who owns this" is never "show it to everyone".
    expect(orgReadable(cpnOnly, { tenant_id: null })).toBe(false);
  });

  it('allows a superadmin to see the unclassified anomaly, so it can be fixed', () => {
    expect(orgReadable(superAdmin, { tenant_id: null })).toBe(true);
  });

  it('refuses a null org rather than throwing', () => {
    expect(orgReadable(superAdmin, null)).toBe(false);
  });
});
