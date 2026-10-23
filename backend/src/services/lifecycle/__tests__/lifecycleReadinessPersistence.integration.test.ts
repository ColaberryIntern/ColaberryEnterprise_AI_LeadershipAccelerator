/**
 * The readiness table's CHECK constraints REFUSE, proved against real Postgres.
 *
 * Session CC-20261021-h9v3. Design §4.
 *
 * ## Why this is an integration test and not a string assertion
 *
 * `ensureProjectLifecycleSchema.test.ts` asserts the DDL text contains these constraints. That is
 * the house style for shape, and it is worth having - but this programme has spent a long
 * register entry on the difference between a statement containing the words and a database
 * enforcing them. The three governance rules below are the reason this table can be trusted by a
 * future automatic advancer, so each one is proved by watching the insert FAIL:
 *
 *   measured_by must be a system identity   a readiness row attributed to a person is refused
 *   performed_act is never an approval      `contract.approve` as a performed act is refused
 *   satisfied cannot lie                    `satisfied = true` with blocking gaps is refused
 *
 * Every one of those is a rule CLAUDE.md or the claim register states in prose. Here they are
 * enforced by the database, which means they hold for writers that have never read either.
 *
 * ## The FK parents are deliberate stubs
 *
 * `project_lifecycle_states` references `tenants`, `projects` and `delivery_projects`, and those
 * reference further tables. Nothing about these constraints depends on what a tenant or a project
 * contains, so the parents are minimal stubs and the tables under test come from the PRODUCTION
 * DDL (`PROJECT_LIFECYCLE_STATEMENTS`). The same split the broadcast telemetry suite uses.
 *
 * ── Running it ────────────────────────────────────────────────────────────────────────
 *
 *   docker run --rm -d --name readiness-pg-test -p 55442:5432 \
 *     -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=ci -e POSTGRES_DB=test_readiness \
 *     postgres:16-alpine
 *
 *   # from backend/:
 *   DATABASE_URL=postgres://ci@127.0.0.1:55442/test_readiness \
 *     npx jest -c jest.config.ts src/services/lifecycle/__tests__/lifecycleReadinessPersistence
 *
 *   docker rm -f readiness-pg-test
 *
 * In CI this runs in the `Integration tier (Postgres)` job, which gives every suite its own
 * database. With no `DATABASE_URL` it SKIPS AND SAYS SO.
 */
import { QueryTypes } from 'sequelize';

jest.setTimeout(120_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[lifecycleReadinessPersistence] SKIPPED: no DATABASE_URL. This suite needs a real Postgres; '
    + 'the docblock has the docker run and the exact command. It is NOT evidence that the '
    + 'readiness constraints refuse anything unless it actually ran.',
  );
}

describeIfDb('the readiness table refuses what the design says it must', () => {
  let sequelize: import('sequelize').Sequelize;
  let recordReadiness: typeof import('../lifecycleReadinessStore').recordReadiness;
  let latestReadiness: typeof import('../lifecycleReadinessStore').latestReadiness;
  let approvalIsStale: typeof import('../lifecycleReadinessStore').approvalIsStale;
  let READINESS_MEASURED_BY: string;
  let readinessFor: typeof import('../lifecycleReadiness').readinessFor;

  const TENANT = '11111111-1111-4111-8111-111111111111';
  const PROJECT = '22222222-2222-4222-8222-222222222222';
  let lifecycleId = '';

  /** Insert one readiness row with raw SQL, so a constraint can be aimed at directly. */
  async function rawInsert(over: Record<string, unknown> = {}): Promise<void> {
    const row = {
      satisfied: true,
      gap_count: 0,
      gaps: '[]',
      measured_by: 'system:test',
      performed_act: null as string | null,
      target_stage: 'requirements_ready',
      evidence_sha256: `sha-${Math.random().toString(36).slice(2)}`,
      ...over,
    };
    await sequelize.query(
      `INSERT INTO lifecycle_stage_readiness (
         tenant_id, lifecycle_state_id, target_stage, satisfied, gap_count, gaps,
         evidence_sha256, measured_by, performed_act
       ) VALUES (
         :tenant, :lifecycle, :target_stage, :satisfied, :gap_count, CAST(:gaps AS JSONB),
         :evidence_sha256, :measured_by, :performed_act
       )`,
      { replacements: { tenant: TENANT, lifecycle: lifecycleId, ...row }, type: QueryTypes.INSERT },
    );
  }

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    ({ recordReadiness, latestReadiness, approvalIsStale, READINESS_MEASURED_BY } = await import(
      '../lifecycleReadinessStore'
    ));
    ({ readinessFor } = await import('../lifecycleReadiness'));

    // CLEAN FIRST, not only at the end. An afterAll that dies partway leaves a lifecycle row
    // behind, and the next run's insert then violates uq_lifecycle_student_project - which is
    // how this suite failed on its second run before this loop existed. A suite that works only
    // against a virgin database is broken, so the teardown is repeated here as setup.
    for (const table of [
      'lifecycle_stage_readiness', 'lifecycle_stage_failures', 'project_lifecycle_states',
      'delivery_projects', 'projects', 'tenants',
    ]) {
      await sequelize.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    }

    // Deliberate stubs: only their primary keys matter to the FKs under test.
    await sequelize.query('CREATE TABLE IF NOT EXISTS tenants (id UUID PRIMARY KEY)');
    await sequelize.query('CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY)');
    await sequelize.query('CREATE TABLE IF NOT EXISTS delivery_projects (id UUID PRIMARY KEY)');

    const { PROJECT_LIFECYCLE_STATEMENTS } = await import('../../../db/ensureProjectLifecycleSchema');
    const wanted = /lifecycle_stage_readiness|project_lifecycle_states|uq_lifecycle_student/i;
    for (const sql of PROJECT_LIFECYCLE_STATEMENTS) {
      if (wanted.test(sql)) await sequelize.query(sql);
    }

    await sequelize.query('INSERT INTO tenants (id) VALUES ($1) ON CONFLICT DO NOTHING', {
      bind: [TENANT], type: QueryTypes.INSERT,
    });
    await sequelize.query('INSERT INTO projects (id) VALUES ($1) ON CONFLICT DO NOTHING', {
      bind: [PROJECT], type: QueryTypes.INSERT,
    });
    const rows = await sequelize.query<{ id: string }>(
      `INSERT INTO project_lifecycle_states (tenant_id, student_project_id, stage)
       VALUES ($1, $2, 'discovery') RETURNING id`,
      { bind: [TENANT, PROJECT], type: QueryTypes.SELECT },
    );
    lifecycleId = rows[0].id;
  });

  afterAll(async () => {
    // CASCADE: the statement filter above also matched `lifecycle_stage_failures`, which
    // references project_lifecycle_states, so a plain DROP of the parent fails. In a disposable
    // database CASCADE is the honest answer rather than enumerating dependents.
    for (const table of [
      'lifecycle_stage_readiness', 'lifecycle_stage_failures', 'project_lifecycle_states',
      'delivery_projects', 'projects', 'tenants',
    ]) {
      await sequelize.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    }
    await sequelize.close();
  });

  beforeEach(async () => {
    await sequelize.query('DELETE FROM lifecycle_stage_readiness', { type: QueryTypes.DELETE });
  });

  it('POSITIVE CONTROL: a well-formed system measurement is accepted', async () => {
    // Without this, every refusal below could be the table rejecting everything.
    await rawInsert();
    const kept = await latestReadiness(lifecycleId, 'requirements_ready');
    expect(kept?.measuredBy).toBe('system:test');
  });

  it('REFUSES a readiness row attributed to a PERSON', async () => {
    await expect(rawInsert({ measured_by: 'ali@colaberry.com' })).rejects.toThrow(
      /ck_readiness_measured_by_is_system/,
    );
    await expect(rawInsert({ measured_by: 'Ali Muwwakkil' })).rejects.toThrow(
      /ck_readiness_measured_by_is_system/,
    );
  });

  it('REFUSES an approval recorded as a performed act', async () => {
    for (const act of ['contract.approve', 'requirement.approve', 'release.approve']) {
      // eslint-disable-next-line no-await-in-loop
      await expect(rawInsert({ performed_act: act })).rejects.toThrow(
        /ck_readiness_never_an_approval/,
      );
    }
  });

  it('ACCEPTS a work act, because recording work the pipeline did is the point', async () => {
    await rawInsert({ performed_act: 'story.execute' });
    const kept = await latestReadiness(lifecycleId, 'requirements_ready');
    expect(kept?.performedAct).toBe('story.execute');
  });

  it('REFUSES a row that claims to be satisfied while carrying blocking gaps', async () => {
    await expect(rawInsert({
      satisfied: true,
      gap_count: 1,
      gaps: JSON.stringify([{ rule: 'no_requirements', kind: 'unmet', message: 'none' }]),
    })).rejects.toThrow(/ck_readiness_satisfied_iff_no_gaps/);
  });

  it('REFUSES a gap count that disagrees with the gap list', async () => {
    await expect(rawInsert({ satisfied: false, gap_count: 3, gaps: '[]' }))
      .rejects.toThrow(/ck_readiness_satisfied_iff_no_gaps|ck_readiness_gap_count_matches/);
  });

  it('is IDEMPOTENT: the same evidence measured twice is one row, with the first timestamp', async () => {
    const readiness = readinessFor('requirements_ready', {
      ...(await import('./evidenceFixture')).completeEvidence(),
    });

    const first = await recordReadiness({ tenantId: TENANT, lifecycleStateId: lifecycleId, readiness });
    const firstRow = await latestReadiness(lifecycleId, 'requirements_ready');
    const second = await recordReadiness({ tenantId: TENANT, lifecycleStateId: lifecycleId, readiness });

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);

    const rows = await sequelize.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM lifecycle_stage_readiness',
      { type: QueryTypes.SELECT },
    );
    expect(Number(rows[0].n)).toBe(1);

    // The ORIGINAL measurement time survives, the same way a retried approval keeps the original
    // approver and timestamp.
    const after = await latestReadiness(lifecycleId, 'requirements_ready');
    expect(after?.measuredAt.getTime()).toBe(firstRow?.measuredAt.getTime());
    expect(after?.measuredBy).toBe(READINESS_MEASURED_BY);
  });

  it('staleness is answered from the fingerprint, and UNMEASURED is not FRESH', async () => {
    // Nothing measured yet: null, not false. An unmeasured hop is not a fresh one.
    expect(await approvalIsStale(lifecycleId, 'process_ready', 'whatever')).toBeNull();

    const readiness = readinessFor(
      'requirements_ready',
      (await import('./evidenceFixture')).completeEvidence(),
    );
    await recordReadiness({ tenantId: TENANT, lifecycleStateId: lifecycleId, readiness });

    expect(await approvalIsStale(lifecycleId, 'requirements_ready', readiness.evidenceSha256))
      .toBe(false);
    expect(await approvalIsStale(lifecycleId, 'requirements_ready', 'a-different-hash'))
      .toBe(true);
  });
});
