import path from 'path';
import { QueryTypes, type Sequelize } from 'sequelize';
import { readCode, codeIndexOf } from './sourceSweep';

/**
 * P6-T7 — LC-14's cross-tenant clause, RE-TESTED against the seam P6-T1a added.
 *
 * ## Why re-test it at all
 *
 * P5-T7 evidenced the cross-tenant clause against the ROUTES. T1a then added a new write path to
 * `delivery_projects` -- an `afterCreate` hook that writes a `project_lifecycle_states` row -- and
 * a tenancy result proven at the route layer does not carry over to a new write path by itself.
 * The hook runs below the routes, inside whatever transaction the caller opened, with no request
 * context at all.
 *
 * ## The named hazard, and it is specific to this table
 *
 * `entry-points.md:51` records it: `delivery_projects.slug` is unique only PER TENANT, so a bare
 * `findOne({ where: { slug } })` can resolve a `gov-<uuid>` project belonging to ANOTHER TENANT.
 * Two tenants legitimately holding the same slug is the fixture below, because that is the state
 * in which an ambiguous lookup silently returns the wrong row.
 *
 * ## What is asserted
 *
 *   1. Two tenants CAN hold the same slug, so the hazard is real rather than theoretical.
 *   2. Each project gets its own lifecycle, carrying ITS OWN tenant. Enumerated, not sampled.
 *   3. The hook CANNOT be made to write a tenant other than the row's own -- the one new
 *      cross-tenant surface this phase introduces.
 *   4. Row-level checks run AFTER the audited tenant guard, never instead of it, swept from
 *      source with CRLF normalised and comments blanked.
 *
 * ## Running it
 *
 *   docker exec acc-lifecycle-scratch-pg psql -U postgres -c 'CREATE DATABASE t7_tenancy;'
 *   DATABASE_URL=postgres://postgres:scratchlocal@localhost:55432/t7_tenancy \
 *     npx jest --no-cache --forceExit --runTestsByPath \
 *     src/services/lifecycle/__tests__/lifecycleRegistration.tenancy.integration.test.ts
 *
 * The source sweep at the bottom needs NO database and runs either way, on purpose: a tenancy
 * ordering check that skips in CI checks nothing.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[lifecycleRegistration.tenancy] SKIPPED the database half: no DATABASE_URL. Two tenants '
    + 'holding one slug cannot be set up without a real Postgres. The source sweep still runs.',
  );
}

const TENANT_A = '66666666-6666-4666-8666-666666666661';
const TENANT_B = '66666666-6666-4666-8666-666666666662';
const ENGAGEMENT = '66666666-6666-4666-8666-66666666666e';
/** THE SAME SLUG IN BOTH TENANTS. The whole point of the fixture. */
const SHARED_SLUG = 'gov-66666666-6666-4666-8666-66666666666f';

describeIfDb('the registration hook cannot cross a tenant boundary', () => {
  let sequelize: Sequelize;
  let DeliveryProject: any;

  async function lifecycleFor(projectId: string) {
    return sequelize.query<{ id: string; tenant_id: string }>(
      'SELECT id, tenant_id FROM project_lifecycle_states WHERE delivery_project_id = $1',
      { bind: [projectId], type: QueryTypes.SELECT },
    );
  }

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    DeliveryProject = (await import('../../../models/DeliveryProject')).default;
    const { ensureProjectLifecycleSchema } = await import('../../../db/ensureProjectLifecycleSchema');

    const Tenant = (await import('../../../models/Tenant')).default as any;
    await Tenant.sync();
    for (const [id, slug] of [[TENANT_A, 't7-a'], [TENANT_B, 't7-b']]) {
      await Tenant.findOrCreate({ where: { id }, defaults: { id, slug, name: `T7 ${slug}` } });
    }
    await sequelize.query('CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY)');
    await DeliveryProject.sync();
    await ensureProjectLifecycleSchema();

    await sequelize.query('DELETE FROM project_lifecycle_states WHERE tenant_id = ANY($1)', {
      bind: [[TENANT_A, TENANT_B]],
    });
    await sequelize.query('DELETE FROM delivery_projects WHERE tenant_id = ANY($1)', {
      bind: [[TENANT_A, TENANT_B]],
    });
  }, 180_000);

  afterAll(async () => {
    if (!sequelize) return;
    await sequelize.query('DELETE FROM project_lifecycle_states WHERE tenant_id = ANY($1)', {
      bind: [[TENANT_A, TENANT_B]],
    }).catch(() => undefined);
    await sequelize.query('DELETE FROM delivery_projects WHERE tenant_id = ANY($1)', {
      bind: [[TENANT_A, TENANT_B]],
    }).catch(() => undefined);
    await sequelize.query('DELETE FROM tenants WHERE id = ANY($1)', {
      bind: [[TENANT_A, TENANT_B]],
    }).catch(() => undefined);
    await sequelize.close();
  });

  it('THE HAZARD IS REAL: two tenants hold the SAME slug, so a slug lookup is ambiguous', async () => {
    const a = await DeliveryProject.create({
      tenant_id: TENANT_A, engagement_id: ENGAGEMENT, name: 'T7 A', slug: SHARED_SLUG,
      project_class: 'sandbox', status: 'discovery',
    });
    const b = await DeliveryProject.create({
      tenant_id: TENANT_B, engagement_id: ENGAGEMENT, name: 'T7 B', slug: SHARED_SLUG,
      project_class: 'sandbox', status: 'discovery',
    });

    // The database ACCEPTED both, which is correct: the slug is unique per tenant, not globally.
    // That is exactly why a lookup keyed on slug alone cannot be trusted.
    const bySlug = await DeliveryProject.findAll({ where: { slug: SHARED_SLUG } });
    expect(bySlug).toHaveLength(2);
    expect(bySlug.map((r: any) => String(r.get('tenant_id'))).sort())
      .toEqual([TENANT_A, TENANT_B].sort());

    // And a `findOne` on that key resolves ONE of them, with nothing about the caller's tenant
    // deciding which. Asserted as "is one of", not as a specific row, because the answer is
    // genuinely unspecified -- which is the defect, not a flaky test.
    const one = await DeliveryProject.findOne({ where: { slug: SHARED_SLUG } });
    expect([TENANT_A, TENANT_B]).toContain(String(one.get('tenant_id')));

    // Registration did not use the slug. Each project has its own lifecycle under its own tenant.
    const [la] = await lifecycleFor(a.id);
    const [lb] = await lifecycleFor(b.id);
    expect(la.tenant_id).toBe(TENANT_A);
    expect(lb.tenant_id).toBe(TENANT_B);
    expect(la.id).not.toBe(lb.id);
  }, 90_000);

  it('EVERY lifecycle row carries its own project\'s tenant, enumerated not sampled', async () => {
    // A derived check rather than two assertions: any mismatch anywhere in the fixture is named.
    // Sampling two rows would pass against a hook that got it right twice and wrong elsewhere.
    const rows = await sequelize.query<{ project: string; p_tenant: string; l_tenant: string }>(
      `SELECT dp.id AS project, dp.tenant_id AS p_tenant, pls.tenant_id AS l_tenant
         FROM delivery_projects dp
         JOIN project_lifecycle_states pls ON pls.delivery_project_id = dp.id
        WHERE dp.tenant_id = ANY($1)`,
      { bind: [[TENANT_A, TENANT_B]], type: QueryTypes.SELECT },
    );
    expect(rows.length).toBeGreaterThan(0);        // the sweep found something to check
    const mismatched = rows.filter((r) => r.p_tenant !== r.l_tenant);
    expect(mismatched).toEqual([]);
  }, 60_000);

  it('THE NEW SURFACE: the hook writes the ROW\'s tenant, and there is no other input to it', async () => {
    // The one new cross-tenant surface this phase introduces. The hook binds `instance.tenant_id`
    // and nothing else: no parameter, no request context, no ambient default. So the test for
    // "can it be made to write a foreign tenant" is to create under B immediately after A and
    // show the lifecycle follows the ROW rather than anything left over from the previous call.
    const underB = await DeliveryProject.create({
      tenant_id: TENANT_B, engagement_id: ENGAGEMENT, name: 'T7 Follows Row', slug: 'gov-t7-follows',
      project_class: 'sandbox', status: 'discovery',
    });
    const [row] = await lifecycleFor(underB.id);
    expect(row.tenant_id).toBe(TENANT_B);

    // And the complement: passing a tenant in the create attributes moves the PROJECT, so the
    // lifecycle moving with it is correct rather than a leak. There is no way to make the two
    // disagree through this path, which is the property worth having.
    const underA = await DeliveryProject.create({
      tenant_id: TENANT_A, engagement_id: ENGAGEMENT, name: 'T7 Complement', slug: 'gov-t7-complement',
      project_class: 'sandbox', status: 'discovery',
    });
    const [rowA] = await lifecycleFor(underA.id);
    expect(rowA.tenant_id).toBe(TENANT_A);
  }, 90_000);

  it('BOUNDARY, MEASURED AND RECORDED: moving a project later does NOT move its lifecycle', async () => {
    // Not a pass or a fail, a measured fact about the design that a reader should know. The hook
    // records the tenant AT REGISTRATION. If a delivery project is later reassigned to another
    // tenant by a direct update, its lifecycle row keeps the original tenant and the two drift.
    //
    // Recorded rather than fixed here: nothing in the product reassigns a delivery project's
    // tenant today, so there is no measured blast radius, and inventing a trigger for an
    // unobserved operation is how a gate acquires behaviour nobody asked for. It belongs in the
    // Phase 6 boundary report, and this test is what will notice if it ever starts mattering.
    const p = await DeliveryProject.create({
      tenant_id: TENANT_A, engagement_id: ENGAGEMENT, name: 'T7 Drift', slug: 'gov-t7-drift',
      project_class: 'sandbox', status: 'discovery',
    });
    await sequelize.query('UPDATE delivery_projects SET tenant_id = $1 WHERE id = $2', {
      bind: [TENANT_B, p.id],
    });

    const [row] = await lifecycleFor(p.id);
    // The lifecycle still says A while the project now says B. Pinned so that closing this gap,
    // or deciding it is acceptable, is a deliberate change to this assertion.
    expect(row.tenant_id).toBe(TENANT_A);
    const [moved] = await sequelize.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM delivery_projects WHERE id = $1',
      { bind: [p.id], type: QueryTypes.SELECT },
    );
    expect(moved.tenant_id).toBe(TENANT_B);
  }, 90_000);
});

/**
 * THE ORDERING CLAIM, swept from source.
 *
 * Runs WITHOUT a database, because a tenancy ordering check that skips in CI checks nothing.
 *
 * ## Why ORDER and not presence
 *
 * "The audited guard is called" is a much weaker claim than "the row is looked up WITHOUT a
 * tenant filter, then the audited guard runs, then the row is returned". The difference decides
 * whether a cross-tenant attempt is RECORDED or invisible:
 *
 *   - unfiltered lookup, then guard  ->  the row is found, the guard DENIES, and the denial is
 *     written to the access ledger. The attempt is visible.
 *   - tenant-filtered lookup         ->  the row is not found, the caller gets null, and NOTHING
 *     is recorded. A cross-tenant probe is indistinguishable from a typo.
 *
 * The second is the shape this repo already has a standing rule about: row checks go AFTER the
 * audited guard, never instead of it.
 */
describe('row-level checks run AFTER the audited tenant guard, not instead of it', () => {
  const STATUS = path.join(__dirname, '..', 'lifecycleStatus.ts');
  const code = readCode(STATUS);

  it('the sweep instrument works on this file: comments blanked, CRLF normalised', () => {
    // POSITIVE CONTROL FIRST, and it is not optional. Phase 5 lost a grading to a sweep
    // satisfiable by a comment, and then to the fix for it, which was anchored on LF while the
    // file was CRLF and so stripped nothing while reporting green.
    expect(code).not.toContain('\r');
    expect(code.length).toBeGreaterThan(2000);
    // Known code survives...
    expect(code).toContain('export async function loadAndAuthorize');
    // ...and known PROSE does not. This file's docblocks say "audit trail"; the code does not.
    expect(code).not.toContain('audit trail is the whole point');
  });

  it('calls the SHARED audited guard rather than a second implementation', () => {
    // A second implementation is how one path records the attempt and another does not.
    expect(code).toContain('requireTenantAccessAudited');
  });

  it('looks the row up WITHOUT a tenant filter, so a denial is recorded instead of 404d', () => {
    // The load-bearing assertion. The `where` is keyed on the project id alone, deliberately:
    // adding `tenant_id` to it would turn every cross-tenant attempt into a silent null.
    const where = code.slice(codeIndexOf(code, 'const where = kind ==='), codeIndexOf(code, 'const row = await'));
    expect(where).toContain('student_project_id');
    expect(where).toContain('delivery_project_id');
    expect(where).not.toContain('tenant_id');
  });

  it('the guard call is an UNCONDITIONAL statement, not one hidden behind a condition', () => {
    // A MUTATION FOUND THIS HOLE IN THIS VERY SWEEP. Prefixing the call with an always-false
    // condition left every other assertion here passing: presence held, and the index still sat
    // between the lookup and the return. So the line is now matched from its start.
    //
    // This is a TIGHTENING, not a proof. A multi-line guard clause would still defeat it, which
    // is why the REACHABILITY block below exists and is the one that matters. A source sweep can
    // establish order; only running the code can establish that it runs.
    const lines = code.split(String.fromCharCode(10)).filter((l) => l.includes('requireTenantAccessAudited('));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      // Either the destructured import, or an unconditional await statement. Nothing else.
      expect(line.trimStart()).toMatch(/^(await requireTenantAccessAudited|const \{ requireTenantAccessAudited)/);
    }
  });

  it('ORDER: lookup, then the audited guard, then the return', () => {
    const lookup = codeIndexOf(code, 'const row = await ProjectLifecycleState.findOne');
    const guard = codeIndexOf(code, 'await requireTenantAccessAudited');
    const ret = codeIndexOf(code, 'return {');

    // Each must actually be present; -1 would otherwise satisfy the comparisons below by accident.
    for (const [name, i] of [['lookup', lookup], ['guard', guard], ['return', ret]] as const) {
      expect({ name, found: i >= 0 }).toEqual({ name, found: true });
    }
    expect(lookup).toBeLessThan(guard);
    expect(guard).toBeLessThan(ret);
  });

  it('derives the resource tenant FROM THE ROW, not from the caller', () => {
    // A guard handed the caller's own tenant id would always allow. The tenant being checked has
    // to come off the row that was found.
    const between = code.slice(
      codeIndexOf(code, 'const row = await ProjectLifecycleState.findOne'),
      codeIndexOf(code, 'await requireTenantAccessAudited'),
    );
    expect(between).toContain("row.get('tenant_id')");
  });
});

describe('REACHABILITY: the audited guard is actually invoked, not merely present', () => {
  /**
   * The test the source sweep cannot be.
   *
   * A mutation that prefixed the guard call with `if (false)` left every sweep assertion
   * above passing. Presence held; order held; the attempt would have gone unrecorded in
   * production. So this intercepts the module `loadAndAuthorize` dynamically imports and
   * asserts the call happens, with the tenant taken off the ROW.
   *
   * Needs no database: the model lookup is mocked too, because the subject here is whether
   * one function calls another, not what Postgres returns.
   */
  const ROW_TENANT = TENANT_B;
  const PROJECT = '66666666-6666-4666-8666-6666666666aa';
  const ADMIN = { id: 'admin-1', email: 'synthetic.admin@example.test', role: 'admin' };

  afterEach(() => jest.resetModules());

  /**
   * `membershipsEmpty` defaults to FALSE on purpose, so every assertion written before the
   * migration ramp existed keeps its original meaning: a populated membership system runs the
   * strict audited guard. The ramp branch is exercised explicitly below.
   */
  async function loadWithSpies(allowed: boolean, membershipsEmpty = false) {
    jest.resetModules();
    const requireTenantAccessAudited = jest.fn(async () => {
      if (!allowed) {
        const e: any = new Error('Tenant access denied.');
        e.name = 'TenantAccessError';
        throw e;
      }
    });
    jest.doMock('../../../modules/tenancy/tenantAccessGuards', () => ({
      __esModule: true, requireTenantAccessAudited,
    }));
    const logLegacyAdminScope = jest.fn();
    const membershipSystemIsUnpopulated = jest.fn(async () => membershipsEmpty);
    jest.doMock('../../../modules/tenancy/adminScopeBridge', () => ({
      __esModule: true,
      contextFromAdminRequest: jest.fn(async () => ({ platformIdentityId: 'identity-1' })),
      membershipSystemIsUnpopulated,
      logLegacyAdminScope,
    }));
    const recordAccessDecision = jest.fn(async () => true);
    jest.doMock('../../../modules/tenancy/tenantAccessAudit', () => ({
      __esModule: true, recordAccessDecision,
    }));
    const get = (k: string) => ({
      id: 'lifecycle-1', tenant_id: ROW_TENANT, student_project_id: null,
      delivery_project_id: PROJECT, stage: 'discovery', condition: null, condition_reason: null,
    } as Record<string, unknown>)[k];
    jest.doMock('../../../models/ProjectLifecycleState', () => ({
      __esModule: true,
      default: { findOne: jest.fn(async () => ({ get })) },
    }));
    const mod = await import('../lifecycleStatus');
    return {
      loadAndAuthorize: mod.loadAndAuthorize, requireTenantAccessAudited,
      recordAccessDecision, logLegacyAdminScope, membershipSystemIsUnpopulated,
    };
  }

  it('CALLS the audited guard, with the tenant read off the row', async () => {
    const { loadAndAuthorize, requireTenantAccessAudited } = await loadWithSpies(true);
    const row = await loadAndAuthorize(PROJECT, 'delivery', ADMIN as never, 'read');

    // THE ASSERTION THE SWEEP COULD NOT MAKE. `if (false) await guard(...)` fails here.
    expect(requireTenantAccessAudited).toHaveBeenCalledTimes(1);
    const [, resourceTenant, options] = requireTenantAccessAudited.mock.calls[0] as any[];
    // The tenant checked is the ROW’s, not the caller’s. A guard handed the caller’s own
    // tenant would always allow.
    expect(resourceTenant).toBe(ROW_TENANT);
    expect(options.action).toBe('read');
    expect(options.resourceId).toBeTruthy();
    expect(row?.tenant_id).toBe(ROW_TENANT);
  });

  it('a DENIAL propagates: the caller gets the error, not a null that reads as not-found', async () => {
    // The direction that matters for LC-14. If a denial were swallowed into `null`, a
    // cross-tenant probe would be indistinguishable from a typo at every call site.
    const { loadAndAuthorize, requireTenantAccessAudited } = await loadWithSpies(false);
    await expect(loadAndAuthorize(PROJECT, 'delivery', ADMIN as never, 'write'))
      .rejects.toThrow(/Tenant access denied/);
    expect(requireTenantAccessAudited).toHaveBeenCalledTimes(1);
  });

  it('THE RAMP: with NO memberships anywhere, it allows and records a DISTINGUISHABLE reason', async () => {
    // Measured in production on 2026-10-14: `platform_identities` and `tenant_memberships` both
    // hold zero rows, so the strict guard denied every admin and the review surface was
    // activated but unusable. This is the same ramp `brandAdminScopeForAdmin` and
    // `intelligenceScopeForAdmin` already ride.
    const {
      loadAndAuthorize, requireTenantAccessAudited, recordAccessDecision, logLegacyAdminScope,
    } = await loadWithSpies(true, true);

    const row = await loadAndAuthorize(PROJECT, 'delivery', ADMIN as never, 'read');

    expect(row?.tenant_id).toBe(ROW_TENANT);
    // The strict guard is SKIPPED, not called-and-allowed. Those are different, and only one of
    // them explains why the owner could not open the page.
    expect(requireTenantAccessAudited).not.toHaveBeenCalled();
    expect(logLegacyAdminScope).toHaveBeenCalledTimes(1);

    // STILL AUDITED, and tellable apart from a real grant. An audit trail that recorded this as
    // `granted` would make the ramp invisible to anyone counting how long it stayed open.
    expect(recordAccessDecision).toHaveBeenCalledTimes(1);
    const [decision] = recordAccessDecision.mock.calls[0] as any[];
    expect(decision.decision).toBe('allowed');
    expect(decision.reason).toBe('migration_open_legacy_admin');
    expect(decision.resourceTenantId).toBe(ROW_TENANT);
  });

  it('SELF-CLOSING: the moment any membership exists, the strict guard runs again', async () => {
    // The property that makes the ramp acceptable rather than a hole. It keys on the WHOLE table
    // being empty, so the first row anyone creates restores strict scoping here and on the other
    // two surfaces at the same instant - with no flag to remember.
    const {
      loadAndAuthorize, requireTenantAccessAudited, recordAccessDecision, logLegacyAdminScope,
    } = await loadWithSpies(false, false);

    await expect(loadAndAuthorize(PROJECT, 'delivery', ADMIN as never, 'read'))
      .rejects.toThrow(/Tenant access denied/);
    expect(requireTenantAccessAudited).toHaveBeenCalledTimes(1);
    expect(logLegacyAdminScope).not.toHaveBeenCalled();
    expect(recordAccessDecision).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller BEFORE reading anything', async () => {
    // No identity means no audited decision can be recorded against anyone, so the only
    // honest answer is to refuse before the lookup rather than after it.
    const { loadAndAuthorize, requireTenantAccessAudited } = await loadWithSpies(true);
    await expect(loadAndAuthorize(PROJECT, 'delivery', undefined, 'read'))
      .rejects.toThrow(/authenticated identity is required/i);
    expect(requireTenantAccessAudited).not.toHaveBeenCalled();
  });
});
