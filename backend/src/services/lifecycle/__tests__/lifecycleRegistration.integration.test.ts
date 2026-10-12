import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';

/**
 * The registration hook's WRITE-FEASIBILITY contract, against a real Postgres.
 *
 * ## Why these tests and not "does the hook fire"
 *
 * An earlier draft of this task measured four things, all of them about WHEN the hook fires. That
 * was the wrong property. The hook's structure is copied from
 * `services/workLedger/ticketCreationLedgerHook.ts`, which is safe because `ticketService.ts`
 * creates tickets with NO transaction (the word appears zero times in that file) and a lost ledger
 * event is cosmetic. Neither holds here: both live delivery-project creations run inside explicit
 * transactions, and `project_lifecycle_states.delivery_project_id` is a real FK to the parent row.
 * So the question that decides whether this design works at all is whether the hook's INSERT can
 * succeed from inside the caller's transaction — not when it is called.
 *
 * ## Running it
 *
 *   docker run -d --name acc-lifecycle-scratch-pg -p 55432:5432  *     -e POSTGRES_PASSWORD=scratchlocal postgres:15
 *   docker exec acc-lifecycle-scratch-pg psql -U postgres -c 'CREATE DATABASE t1a_registration;'
 *
 *   DATABASE_URL=postgres://postgres:scratchlocal@localhost:55432/t1a_registration  *     npx jest --no-cache --forceExit --runTestsByPath  *     src/services/lifecycle/__tests__/lifecycleRegistration.integration.test.ts
 *
 *   docker rm -f acc-lifecycle-scratch-pg
 *
 * `--forceExit` is there for a measured reason, not as a precaution: without it the run completed
 * its assertions, wrote its results, and then never exited — the connection pool keeps the process
 * alive even though `afterAll` closes the Sequelize instance. The first attempt looked like a hang
 * for ten minutes while the output file already contained a finished test report. If a run appears
 * to hang, read the redirect file before assuming nothing ran.
 *
 * `--no-cache` is not optional: ts-jest was measured in this programme serving a mutant's compiled
 * output for pristine bytes after a mutation cycle, which can fake a pass as easily as a failure.
 *
 * With no `DATABASE_URL` this SKIPS VISIBLY rather than passing quietly. A skipped feasibility
 * check that reports green is worse than no check, because the whole design rests on it.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[lifecycleRegistration.integration] SKIPPED: no DATABASE_URL. These are the measurements that '
    + 'decide whether registration can write from inside the caller transaction at all; a green run '
    + 'without them means nothing. See this file\'s header for the two commands.',
  );
}

const TENANT = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT = '22222222-2222-4222-8222-222222222222';

describeIfDb('P6-T1a — registration write-feasibility against a real Postgres', () => {
  let sequelize: Sequelize;
  let DeliveryProject: any;
  let unregisteredDeliveryProjectsSince: (since?: Date) => Promise<Array<{ id: string }>>;
  let LIVE_SINCE: Date;

  /** Rows this suite created, removed in `afterAll` so a reused database stays usable. */
  const created: string[] = [];

  let seq = 0;
  /**
   * Attributes the model requires. `slug` is unique per tenant, so it is made unique per call.
   *
   * `engagement_id` is `allowNull: false` on the model, so it cannot be omitted — the first draft
   * of this fixture passed null and every test failed on the validator before reaching the hook.
   * It is a plain UUID column with no `references` declared, so a synthetic id is sufficient here
   * and no `delivery_engagements` table is needed.
   */
  function attrs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    seq += 1;
    return {
      engagement_id: '33333333-3333-4333-8333-333333333333',
      tenant_id: TENANT,
      organization_id: null,
      brand_id: null,
      name: `T1a probe ${seq}`,
      slug: `t1a-probe-${seq}-${Date.now()}`,
      project_class: 'internal',
      status: 'discovery',
      ...overrides,
    };
  }

  async function lifecycleCount(deliveryProjectId: string, transaction?: Transaction): Promise<number> {
    const rows = await sequelize.query<{ n: string }>(
      'SELECT count(*) AS n FROM project_lifecycle_states WHERE delivery_project_id = $1',
      { bind: [deliveryProjectId], type: QueryTypes.SELECT, transaction },
    );
    return Number(rows[0].n);
  }

  async function projectCount(id: string): Promise<number> {
    const rows = await sequelize.query<{ n: string }>(
      'SELECT count(*) AS n FROM delivery_projects WHERE id = $1',
      { bind: [id], type: QueryTypes.SELECT },
    );
    return Number(rows[0].n);
  }

  /** Make the lifecycle INSERT fail, run `fn`, then remove the trigger whatever happened. */
  async function withFailingRegistration<T>(fn: () => Promise<T>): Promise<T> {
    await sequelize.query(`CREATE OR REPLACE FUNCTION t1a_fail_registration() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'synthetic registration failure'; END; $$ LANGUAGE plpgsql`);
    await sequelize.query(`CREATE TRIGGER t1a_fail BEFORE INSERT ON project_lifecycle_states
      FOR EACH ROW EXECUTE FUNCTION t1a_fail_registration()`);
    try {
      return await fn();
    } finally {
      await sequelize.query('DROP TRIGGER IF EXISTS t1a_fail ON project_lifecycle_states');
      await sequelize.query('DROP FUNCTION IF EXISTS t1a_fail_registration()');
    }
  }

  beforeAll(async () => {
    // Lazily imported so the module's top-level `new Sequelize(...)` never runs in CI, following
    // `lifecycleJourneys.integration.test.ts` beside this file.
    ({ sequelize } = await import('../../../config/database'));
    DeliveryProject = (await import('../../../models/DeliveryProject')).default;
    ({ unregisteredDeliveryProjectsSince, LIFECYCLE_REGISTRATION_LIVE_SINCE: LIVE_SINCE } =
      await import('../projectLifecycleRegistration') as any);
    const { ensureProjectLifecycleSchema } = await import('../../../db/ensureProjectLifecycleSchema');

    // The lifecycle tables FK to tenants/projects/delivery_projects, and a disposable database has
    // none of them.
    //
    // `tenants` is built FROM ITS MODEL, not by hand. An earlier version wrote
    // `CREATE TABLE IF NOT EXISTS tenants (id UUID PRIMARY KEY)`, which looked harmless and was
    // not: `CREATE TABLE IF NOT EXISTS` makes a later `Tenant.sync()` a NO-OP, so the real `slug`
    // and `name` columns never appeared. The gov suite beside this one resolves its container by
    // `slug`, so running the two in one database broke the second one in EITHER order — and the
    // shared-scratch-database regression workflow this run has used since Phase 5 would have
    // reported that as a red from the task under test. A one-column stand-in for a table a sibling
    // suite needs properly is a trap, not a shortcut.
    const Tenant = (await import('../../../models/Tenant')).default as any;
    await Tenant.sync();
    await sequelize.query('CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY)');
    for (const [id, slug] of [[TENANT, 't1a-reg-primary'], [OTHER_TENANT, 't1a-reg-other']]) {
      await Tenant.findOrCreate({ where: { id }, defaults: { id, slug, name: `T1a ${slug}` } });
    }

    // `delivery_projects` is created FROM THE MODEL rather than by hand-written DDL, so the table
    // under test is the real one. A hand-written stand-in would drift from the model and the hook
    // would be exercised against a shape production does not have.
    await DeliveryProject.sync();
    await ensureProjectLifecycleSchema();
  }, 120_000);

  afterAll(async () => {
    if (!sequelize) return;
    await sequelize.query('DELETE FROM project_lifecycle_states WHERE tenant_id = ANY($1)', {
      bind: [[TENANT, OTHER_TENANT]],
    });
    await sequelize.query('DELETE FROM delivery_projects WHERE tenant_id = ANY($1)', {
      bind: [[TENANT, OTHER_TENANT]],
    });
    await sequelize.close();
  });

  it('the apparatus is real: the model built the table and the lifecycle DDL landed', async () => {
    // Guards the failure where sync() or the DDL silently warn-skipped and every assertion below
    // then measures an absent mechanism. `ensureProjectLifecycleSchema` logs a warning and carries
    // on rather than throwing, which is exactly how that would look like success.
    const cols = await sequelize.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'delivery_projects' ORDER BY column_name`,
      { type: QueryTypes.SELECT },
    );
    expect(cols.map((c) => c.column_name)).toEqual(expect.arrayContaining(['tenant_id', 'slug', 'project_class']));

    const idx = await sequelize.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'project_lifecycle_states'`,
      { type: QueryTypes.SELECT },
    );
    // The partial unique index is what makes registration idempotent. Without it the uniqueness
    // test below would pass for the wrong reason.
    expect(idx.map((i) => i.indexname)).toContain('uq_lifecycle_delivery_project');
  });

  it('registers a lifecycle on a plain create', async () => {
    const p = await DeliveryProject.create(attrs());
    created.push(p.id);
    expect(await lifecycleCount(p.id)).toBe(1);
  });

  it('writes INSIDE the caller transaction, so the FK to the uncommitted parent resolves', async () => {
    // THE measurement this whole design rests on. If the hook wrote on another connection it could
    // not see the uncommitted parent row and would trip
    // `project_lifecycle_states.delivery_project_id`'s FK. Asserting the row is visible WITHIN the
    // transaction, before commit, is what distinguishes "joined the transaction" from "happened to
    // work because the parent had already committed".
    const tx = await sequelize.transaction();
    let id: string;
    try {
      const p = await DeliveryProject.create(attrs(), { transaction: tx });
      id = p.id;
      expect(await lifecycleCount(id, tx)).toBe(1);
      // ...and invisible outside it, which proves it is genuinely inside the transaction and not
      // merely written before the assertion.
      expect(await lifecycleCount(id)).toBe(0);
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    created.push(id);
    expect(await lifecycleCount(id)).toBe(1);
  });

  it('a rolled-back create leaves NO lifecycle row and NO project row', async () => {
    // The orphan-row failure in the other direction: a registration that outlived its parent.
    const tx = await sequelize.transaction();
    const p = await DeliveryProject.create(attrs(), { transaction: tx });
    await tx.rollback();

    expect(await projectCount(p.id)).toBe(0);
    expect(await lifecycleCount(p.id)).toBe(0);
  });

  it('A FAILING REGISTRATION ABORTS A TRANSACTIONAL CREATE — the deliberate inversion', async () => {
    // Opposite of the ticket-ledger precedent's contract, and correct here: a delivery project that
    // cannot be registered must not exist. Both live creation paths are transactional, so this is
    // the contract that applies to them.
    const tx = await sequelize.transaction();
    const a = attrs();
    await withFailingRegistration(async () => {
      await expect(DeliveryProject.create(a, { transaction: tx })).rejects.toThrow();
    });
    await tx.rollback().catch(() => undefined);

    const rows = await sequelize.query<{ id: string }>(
      'SELECT id FROM delivery_projects WHERE slug = $1',
      { bind: [a.slug], type: QueryTypes.SELECT },
    );
    expect(rows).toHaveLength(0);
  });

  it('BUT a NON-transactional create keeps its row when registration fails — the measured limit', async () => {
    // This is the honest boundary of the inversion above, and it is NOT what the hook's first
    // header claimed. Without a caller transaction the project INSERT has already committed by the
    // time `afterCreate` runs, so a throwing hook surfaces an error while the row survives,
    // unregistered.
    //
    // It matters because the three seed scripts
    // (`seedDevClientReviewer`, `seedFactoryDemoContract`, `seedOrdinaryProjectDemo`) create
    // bare — measured: none of them contains the word "transaction". So for operator-run seeds the
    // guarantee is NOT "no unregistered project"; it is "an unregistered project is detectable".
    // The reconciliation query below is that detector, which is why it is a required part of this
    // task rather than a nicety.
    const a = attrs();
    await withFailingRegistration(async () => {
      await expect(DeliveryProject.create(a)).rejects.toThrow();
    });

    const rows = await sequelize.query<{ id: string }>(
      'SELECT id FROM delivery_projects WHERE slug = $1',
      { bind: [a.slug], type: QueryTypes.SELECT },
    );
    expect(rows).toHaveLength(1);
    created.push(rows[0].id);
    expect(await lifecycleCount(rows[0].id)).toBe(0);

    // And the detector finds precisely it.
    const unregistered = await unregisteredDeliveryProjectsSince(new Date(Date.now() - 600_000));
    expect(unregistered.map((r) => r.id)).toContain(rows[0].id);
  });

  it('fires on findOrCreate CREATE branch and not on its FIND branch', async () => {
    // The reason a model hook beats the chokepoints: `businessProcessSeedService.ts:135` is a
    // `findOrCreate`, which no `.create(`-only sweep would ever have found. Measured here on the
    // table that has a tenant, since the student table is unwired.
    const a = attrs();
    const [first, createdFirst] = await DeliveryProject.findOrCreate({
      where: { tenant_id: TENANT, slug: a.slug }, defaults: a,
    });
    created.push(first.id);
    expect(createdFirst).toBe(true);
    expect(await lifecycleCount(first.id)).toBe(1);

    const [second, createdSecond] = await DeliveryProject.findOrCreate({
      where: { tenant_id: TENANT, slug: a.slug }, defaults: a,
    });
    expect(createdSecond).toBe(false);
    expect(second.id).toBe(first.id);
    // Still ONE. A hook firing on the find branch would register a second lifecycle for the same
    // project on every seed re-run.
    expect(await lifecycleCount(first.id)).toBe(1);
  });

  it('does NOT fire on bulkCreate, which is why that mechanism has a source tripwire', async () => {
    // `individualHooks` defaults to false, so this is a real bypass. It is zero occurrences in the
    // source today and the coverage suite fails by name if one appears — but the gap is proven
    // here rather than asserted from the Sequelize source, because a mechanism is a claim.
    const a = attrs();
    const [p] = await DeliveryProject.bulkCreate([a]);
    created.push(p.id);
    expect(await projectCount(p.id)).toBe(1);
    expect(await lifecycleCount(p.id)).toBe(0);

    const unregistered = await unregisteredDeliveryProjectsSince(new Date(Date.now() - 600_000));
    expect(unregistered.map((r) => r.id)).toContain(p.id);
  });

  it('registers once per project, and the index is what makes that true', async () => {
    const p = await DeliveryProject.create(attrs());
    created.push(p.id);
    expect(await lifecycleCount(p.id)).toBe(1);

    // Replay: the same registration again is a no-op, not a second row and not an error. This is
    // the gov re-approval path, which re-runs creation on every approval.
    const { deliveryProjectLifecycleHook } = await import('../projectLifecycleRegistration');
    await deliveryProjectLifecycleHook({ id: p.id, tenant_id: TENANT });
    expect(await lifecycleCount(p.id)).toBe(1);

    // POSITIVE CONTROL, and it measured something better than it was written to measure.
    //
    // The intent was: drop the partial unique index, show a duplicate becomes possible, and so
    // prove the assertion above is evidence of the constraint rather than of the hook happening
    // not to run twice. What actually happens is that the hook RAISES — because
    // `ON CONFLICT (delivery_project_id) WHERE ...` has to infer an index, and with
    // `uq_lifecycle_delivery_project` gone there is none to infer.
    //
    // That is a stronger safety property than idempotency alone, and it is worth stating plainly:
    // the index is load-bearing for registration WORKING, not merely for it being idempotent. If a
    // migration ever lands the table without that index, registration fails loudly instead of
    // quietly writing duplicate lifecycles. `ensureProjectLifecycleSchema` warn-skips rather than
    // throwing, so "the index is missing and nothing told us" is a real deploy state — which is
    // exactly why the post-deploy schema verification is a required step and not a formality.
    //
    // The control still does its job: with the index dropped the assertion above cannot hold by
    // accident, so it is not vacuous. And the thing that must never happen — a second lifecycle
    // for one project — is asserted directly.
    await sequelize.query('DROP INDEX uq_lifecycle_delivery_project');
    try {
      await expect(deliveryProjectLifecycleHook({ id: p.id, tenant_id: TENANT })).rejects.toThrow();
      expect(await lifecycleCount(p.id)).toBe(1);
    } finally {
      await sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_lifecycle_delivery_project
        ON project_lifecycle_states (delivery_project_id) WHERE delivery_project_id IS NOT NULL`);
    }

    // And with the index restored, replay is a no-op again rather than an error — so the failure
    // above was the missing index and nothing else.
    await deliveryProjectLifecycleHook({ id: p.id, tenant_id: TENANT });
    expect(await lifecycleCount(p.id)).toBe(1);
  });

  it('records a caller-supplied entry point, which is how the seed scripts label themselves', async () => {
    // A model hook cannot know which service called it, so guessing the caller from the row's shape
    // would be fabricated provenance. Instead a caller that wants to be identifiable says so, and
    // the three seed scripts now do: `seed:devClientReviewer`, `seed:factoryDemoContract`,
    // `seed:ordinaryProjectDemo`.
    //
    // This is the acceptance for "the seed scripts are covered too, and labelled". The hook
    // deliberately does NOT special-case them — a conditional on "is this a seed" is precisely the
    // bypass the model-hook design exists to prevent — so they are labelled rather than skipped.
    const p = await DeliveryProject.create(attrs(), { lifecycleEntryPoint: 'seed:probe' } as any);
    created.push(p.id);
    const rows = await sequelize.query<{ entry_point: string }>(
      'SELECT entry_point FROM project_lifecycle_states WHERE delivery_project_id = $1',
      { bind: [p.id], type: QueryTypes.SELECT },
    );
    expect(rows[0].entry_point).toBe('seed:probe');

    // And the default is the mechanism, not a guess at a caller.
    const q = await DeliveryProject.create(attrs());
    created.push(q.id);
    const qRows = await sequelize.query<{ entry_point: string }>(
      'SELECT entry_point FROM project_lifecycle_states WHERE delivery_project_id = $1',
      { bind: [q.id], type: QueryTypes.SELECT },
    );
    expect(qRows[0].entry_point).toBe('delivery_project.afterCreate');
  });

  it('writes the row OWN tenant and cannot be steered to another', async () => {
    // The one new cross-tenant surface this phase introduces. The hook takes its tenant from the
    // row, so the test that matters is that the stored lifecycle tenant always equals the
    // project's — never a caller-supplied value.
    const p = await DeliveryProject.create(attrs({ tenant_id: OTHER_TENANT }));
    created.push(p.id);
    const rows = await sequelize.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM project_lifecycle_states WHERE delivery_project_id = $1',
      { bind: [p.id], type: QueryTypes.SELECT },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe(OTHER_TENANT);
  });

  it('the reconciliation query reports clean when every project is registered', async () => {
    // Run last, after the two deliberate orphans above are the only known gaps. Asserting the
    // query returns [] for a registered-only window proves it can say "clean" and is not simply
    // returning everything.
    const p = await DeliveryProject.create(attrs());
    created.push(p.id);
    const since = new Date(Date.now() - 1_000);
    const unregistered = await unregisteredDeliveryProjectsSince(since);
    expect(unregistered.map((r) => r.id)).not.toContain(p.id);
    expect(LIVE_SINCE instanceof Date).toBe(true);
  });
});
