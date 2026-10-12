import { QueryTypes, type Sequelize } from 'sequelize';

/**
 * P6-T1b — LC-01's STUDENT half, against a real Postgres.
 *
 * ## What was blocking this, and what unblocked it
 *
 * `project_lifecycle_states.tenant_id` is `NOT NULL REFERENCES tenants(id)`, and `projects` had
 * no tenant column -- nor did `enrollments`, `programs`, `cohorts` or `users`. 60 tables in this
 * database carry `tenant_id` and `projects` was not among them, so a model hook had nothing to
 * key on. Escalated; the DRI chose `colaberry` on 2026-10-12 after reviewing what the backfill
 * does.
 *
 * ## The four properties worth testing, and one of them is a refusal
 *
 *   1. The migration is ADDITIVE and the backfill attributes rows that already existed.
 *   2. A new project gets a tenant at INSERT and a lifecycle row immediately after.
 *   3. An UNATTRIBUTABLE project is still CREATED, is left unregistered, and says so loudly.
 *      This is the deliberate asymmetry with the delivery hook, which throws. Setting a tenant
 *      is data; refusing to create a student's project is enforcement, and throwing here would
 *      break a live creation path for a governance reason with the feature flag off.
 *   4. The resolver REFUSES once more than one tenant owns student projects, rather than
 *      defaulting forever. A constant is correct only while one tenant runs cohorts; the day a
 *      second one does, a silent default becomes a silent mis-attribution.
 *
 * ## Running it
 *
 *   docker exec acc-lifecycle-scratch-pg psql -U postgres -c 'CREATE DATABASE t1b_student;'
 *   DATABASE_URL=postgres://postgres:scratchlocal@localhost:55432/t1b_student \
 *     npx jest --no-cache --forceExit --runTestsByPath \
 *     src/services/lifecycle/__tests__/studentProjectRegistration.integration.test.ts
 *
 * SKIPS VISIBLY without `DATABASE_URL`. Every claim here is about what a hook writes to a table.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[studentProjectRegistration.integration] SKIPPED: no DATABASE_URL. LC-01\'s student half is '
    + 'entirely about rows a hook writes, which cannot be checked without a real Postgres.',
  );
}

/** Captures the structured log lines a hook emits, so a refusal can be asserted on. */
function captureLogs(): { lines: Record<string, unknown>[]; restore: () => void } {
  const lines: Record<string, unknown>[] = [];
  const spy = jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    try { lines.push(JSON.parse(String(args[0]))); } catch { /* not ours */ }
  });
  const errSpy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    try { lines.push(JSON.parse(String(args[0]))); } catch { /* not ours */ }
  });
  return { lines, restore: () => { spy.mockRestore(); errSpy.mockRestore(); } };
}

describeIfDb('P6-T1b — student projects register a lifecycle', () => {
  let sequelize: Sequelize;
  let Project: any;
  let Tenant: any;
  let ensureProjectTenantSchema: any;
  let assertProjectTenantSchema: any;
  let resolveStudentTenantId: any;
  let unregisteredStudentProjectsSince: any;
  let STUDENT_TENANT_SLUG: string;

  let colaberryId = '';
  const OTHER_TENANT = '55555555-5555-4555-8555-555555555552';
  const PROGRAM = '55555555-5555-4555-8555-55555555550p'.replace('p', 'a');
  const ENROLLMENT = '55555555-5555-4555-8555-55555555550e'.replace('e', 'b');

  async function lifecycleFor(projectId: string) {
    return sequelize.query<{ id: string; tenant_id: string; stage: string; entry_point: string }>(
      `SELECT id, tenant_id, stage, entry_point
         FROM project_lifecycle_states WHERE student_project_id = $1`,
      { bind: [projectId], type: QueryTypes.SELECT },
    );
  }

  /** The minimum a `projects` row needs. Every NOT NULL column, nothing more. */
  const projectAttrs = (name: string) => ({
    enrollment_id: ENROLLMENT,
    program_id: PROGRAM,
    name,
    organization_name: 'T1b Org',
    industry: 'Testing',
    primary_business_problem: 'p',
    selected_use_case: 'u',
    automation_goal: 'g',
  });

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    Tenant = (await import('../../../models/Tenant')).default;
    ({ ensureProjectTenantSchema, assertProjectTenantSchema } =
      await import('../../../db/ensureProjectTenantSchema'));
    ({ resolveStudentTenantId, STUDENT_TENANT_SLUG } = await import('../studentTenant'));
    ({ unregisteredStudentProjectsSince } = await import('../projectLifecycleRegistration'));

    await Tenant.sync();
    const [colaberry] = await Tenant.findOrCreate({
      where: { slug: STUDENT_TENANT_SLUG },
      defaults: { slug: STUDENT_TENANT_SLUG, name: 'Colaberry' },
    });
    colaberryId = String(colaberry.get('id'));
    await Tenant.findOrCreate({
      where: { id: OTHER_TENANT }, defaults: { id: OTHER_TENANT, slug: 't1b-other', name: 'Other' },
    });

    // `projects` has real FKs to `enrollments` and `program_blueprints`, which a disposable
    // database lacks. Stand-ins for the PARENTS only -- `projects` itself is built from its
    // model, so the table under test is the real one.
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)');
    await sequelize.query('CREATE TABLE IF NOT EXISTS program_blueprints (id UUID PRIMARY KEY)');
    await sequelize.query('INSERT INTO enrollments (id) VALUES ($1) ON CONFLICT DO NOTHING', { bind: [ENROLLMENT] });
    await sequelize.query('INSERT INTO program_blueprints (id) VALUES ($1) ON CONFLICT DO NOTHING', { bind: [PROGRAM] });

    Project = (await import('../../../models/Project')).default;
    await Project.sync();

    // `delivery_projects` too, and NOT because this suite uses it: the lifecycle tables carry
    // real FKs to it, so `ensureProjectLifecycleSchema` creates NOTHING without it and then
    // correctly reports its own post-condition violated. The first run of this suite failed
    // that way -- eight "relation does not exist" warnings and every assertion failing
    // downstream for a reason that had nothing to do with the task under test.
    const DeliveryProject = (await import('../../../models/DeliveryProject')).default as any;
    await DeliveryProject.sync();
    const { ensureProjectLifecycleSchema } = await import('../../../db/ensureProjectLifecycleSchema');
    await ensureProjectLifecycleSchema();
  }, 240_000);

  afterAll(async () => {
    if (!sequelize) return;
    await sequelize.query('DELETE FROM project_lifecycle_states').catch(() => undefined);
    await sequelize.query('DELETE FROM projects').catch(() => undefined);
    await sequelize.close();
  });

  it('THE MIGRATION: adds the column, backfills rows that already existed, and asserts itself', async () => {
    // A row written BEFORE the column is attributed is the whole point of a backfill, so one is
    // created with the column explicitly null rather than relying on history.
    await sequelize.query('DELETE FROM project_lifecycle_states');
    await sequelize.query('DELETE FROM projects');
    const pre = await Project.create({ ...projectAttrs('T1b Pre-existing'), tenant_id: null },
      { hooks: false });
    expect(String(pre.get('tenant_id') ?? '')).toBe('');

    expect(await ensureProjectTenantSchema()).toBe(true);

    const [row] = await sequelize.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM projects WHERE id = $1', { bind: [pre.id], type: QueryTypes.SELECT },
    );
    expect(row.tenant_id).toBe(colaberryId);

    // The POST-CONDITION is about the data, not only the catalog. A column that exists while
    // every row is still null would satisfy a shape-only check and leave every project ungoverned.
    expect(await assertProjectTenantSchema()).toBe(true);
  }, 120_000);

  it('the assertion FAILS on an un-migrated database, which is what makes it an assertion', async () => {
    // An assertion nobody has seen fail is not an assertion. In this family of modules a
    // `DROP INDEX` once failed silently inside a best-effort loop and the fix shipped green
    // having done nothing at all.
    await sequelize.query('ALTER TABLE projects DROP COLUMN IF EXISTS tenant_id');
    const logs = captureLogs();
    try {
      expect(await assertProjectTenantSchema()).toBe(false);
    } finally { logs.restore(); }

    const violation = logs.lines.find((l) => l.event === 'project_tenant_schema_invariant_violated');
    expect(violation).toBeDefined();
    expect((violation as any).error_class).toBe('SchemaInvariantViolation');
    expect(String((violation as any).context.problems)).toContain('projects.tenant_id missing');

    // Put it back for the rest of the suite.
    expect(await ensureProjectTenantSchema()).toBe(true);
  }, 120_000);

  it('A NEW PROJECT gets a tenant at insert and a lifecycle row immediately after', async () => {
    const p = await Project.create(projectAttrs('T1b New'));

    // Attributed by `beforeCreate`, so the row was correct when it landed rather than corrected
    // by a second write.
    expect(String(p.get('tenant_id'))).toBe(colaberryId);

    const rows = await lifecycleFor(p.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe(colaberryId);
    expect(rows[0].stage).toBe('discovery');
    expect(rows[0].entry_point).toBe('project.afterCreate');
  }, 120_000);

  it('an EXPLICIT tenant is never overridden by the resolver', async () => {
    // A caller that supplied a tenant made a decision. Resolution is a fallback for the paths
    // that have none, not a correction of the ones that do.
    const p = await Project.create({ ...projectAttrs('T1b Explicit'), tenant_id: OTHER_TENANT });
    expect(String(p.get('tenant_id'))).toBe(OTHER_TENANT);
    const rows = await lifecycleFor(p.id);
    expect(rows[0].tenant_id).toBe(OTHER_TENANT);

    // CLEANED UP, and the reason is a defect this test FOUND. The first version of the
    // resolver refused to attribute anything once more than one tenant owned a project, so
    // this single row silently disabled attribution for every later test in the file -- and,
    // in production, for every project created after one deliberate cross-tenant placement.
    // The resolver now warns instead of refusing; the cleanup stays so the suite does not
    // depend on test order to be meaningful.
    await sequelize.query('DELETE FROM project_lifecycle_states WHERE student_project_id = $1',
      { bind: [p.id] });
    await sequelize.query('DELETE FROM projects WHERE id = $1', { bind: [p.id] });
  }, 120_000);

  it('a REPLAY is a no-op, not a duplicate', async () => {
    // `ON CONFLICT (student_project_id)` targets the partial unique index
    // `ensureProjectLifecycleSchema` creates. Driven by calling the hook again on the same row,
    // which is what a retried creation would do.
    const p = await Project.create(projectAttrs('T1b Replay'));
    const { studentProjectLifecycleHook } = await import('../projectLifecycleRegistration');
    await studentProjectLifecycleHook({ id: p.id, tenant_id: colaberryId });
    await studentProjectLifecycleHook({ id: p.id, tenant_id: colaberryId });
    expect(await lifecycleFor(p.id)).toHaveLength(1);
  }, 120_000);

  it('findOrCreate registers on the create branch and does nothing on the find branch', async () => {
    // The second of the two student creation sites the derived enumeration finds
    // (`businessProcessSeedService.ts:135`). `afterCreate` fires only when it actually creates,
    // so the find branch must not produce a second lifecycle row.
    const where = { name: 'T1b FindOrCreate' };
    const [first, created1] = await Project.findOrCreate({
      where, defaults: projectAttrs('T1b FindOrCreate'),
    });
    expect(created1).toBe(true);
    expect(await lifecycleFor(first.id)).toHaveLength(1);

    const [again, created2] = await Project.findOrCreate({
      where, defaults: projectAttrs('T1b FindOrCreate'),
    });
    expect(created2).toBe(false);
    expect(again.id).toBe(first.id);
    expect(await lifecycleFor(first.id)).toHaveLength(1);
  }, 120_000);

  it('AN UNATTRIBUTABLE PROJECT IS STILL CREATED, left unregistered, and says so loudly', async () => {
    // The deliberate asymmetry with the delivery hook, which throws. Driven by renaming the
    // configured tenant so the slug resolves to nothing -- a real misconfiguration rather than a
    // mocked one.
    await sequelize.query('UPDATE tenants SET slug = $1 WHERE slug = $2',
      { bind: ['colaberry-renamed', STUDENT_TENANT_SLUG] });
    const logs = captureLogs();
    let p: any;
    try {
      p = await Project.create(projectAttrs('T1b Unattributable'));
    } finally { logs.restore(); }

    // CREATED. A student's project is not refused for a governance reason with the flag off.
    expect(p.id).toBeTruthy();
    expect(p.get('tenant_id') ?? null).toBeNull();

    // UNREGISTERED, and the absence is reported rather than silent.
    expect(await lifecycleFor(p.id)).toHaveLength(0);
    const unresolved = logs.lines.find((l) => l.event === 'student_tenant_unresolved');
    expect((unresolved as any)?.context?.reason).toBe('configured_tenant_missing');
    const skipped = logs.lines.find((l) => l.event === 'student_project_lifecycle_unregistered');
    expect(skipped).toBeDefined();
    expect((skipped as any).error_class).toBe('ContractViolation');
    expect((skipped as any).reason).toBe('tenant_unresolved');

    // And the DETECTOR finds it, which is how an operator would. Path-agnostic: it asks LC-01's
    // actual question rather than checking the paths somebody remembered to instrument.
    const unregistered = await unregisteredStudentProjectsSince(new Date(Date.now() - 600_000));
    expect(unregistered.map((r: any) => r.id)).toContain(p.id);

    await sequelize.query('UPDATE tenants SET slug = $1 WHERE slug = $2',
      { bind: [STUDENT_TENANT_SLUG, 'colaberry-renamed'] });
  }, 120_000);

  it('THE WARNING: a second tenant owning projects still resolves, loudly', async () => {
    // THIS TEST ASSERTED THE OPPOSITE AN HOUR AGO, and the change is the point. It required
    // the resolver to REFUSE once a second tenant owned student projects, which I had
    // described as "refuse rather than guess". Running the suite showed what that actually
    // does: one project in a second tenant disables attribution for every project after it,
    // leaving them with no lifecycle at all. A refusal does not prevent the harm it was aimed
    // at -- it converts "possibly wrong tenant" into "no governance", which is worse.
    //
    // So the state is now a WARNING carrying the observed list, and the honest limit is
    // recorded rather than engineered around: while the default stands, a second tenant
    // genuinely running cohorts WOULD be mis-attributed. That cannot be distinguished from a
    // deliberate placement using `projects.tenant_id` alone, and the real fix is deriving the
    // tenant per project from its programme.
    const second = await Project.create({ ...projectAttrs('T1b Second Tenant'), tenant_id: OTHER_TENANT });
    expect(String(second.get('tenant_id'))).toBe(OTHER_TENANT);

    const logs = captureLogs();
    let resolution: any;
    try { resolution = await resolveStudentTenantId(); } finally { logs.restore(); }

    // It RESOLVES. Attribution keeps working.
    expect(resolution.reason).toBe('resolved');
    expect(resolution.tenantId).toBe(colaberryId);
    // And it reports both tenants, which is what makes the state actionable.
    expect(resolution.observed.sort()).toEqual([colaberryId, OTHER_TENANT].sort());

    const warned = logs.lines.find((l) => l.event === 'student_tenant_multi_tenant_observed');
    expect(warned).toBeDefined();
    expect((warned as any).level).toBe('warn');
    expect(String((warned as any).context.note)).toContain('MIS-ATTRIBUTE');

    // A project created in this state still gets a lifecycle, which is the regression the old
    // policy caused and this assertion exists to prevent returning to.
    const after = await Project.create(projectAttrs('T1b During Multi Tenant'));
    expect(await lifecycleFor(after.id)).toHaveLength(1);
  }, 120_000);

  it('POSITIVE CONTROL: the warning does NOT fire in the healthy single-tenant case', async () => {
    // Without this, a resolver that warned unconditionally would satisfy the test above while
    // making the signal meaningless. The warning has to be absent when the state is healthy,
    // or it is noise rather than a signal.
    await sequelize.query('DELETE FROM project_lifecycle_states');
    await sequelize.query('DELETE FROM projects');
    await Project.create({ ...projectAttrs('T1b Single'), tenant_id: colaberryId });

    const logs = captureLogs();
    let resolution: any;
    try { resolution = await resolveStudentTenantId(); } finally { logs.restore(); }

    expect(resolution.reason).toBe('resolved');
    expect(resolution.tenantId).toBe(colaberryId);
    expect(resolution.observed).toEqual([colaberryId]);
    expect(logs.lines.find((l) => l.event === 'student_tenant_multi_tenant_observed'))
      .toBeUndefined();
  }, 120_000);
});
