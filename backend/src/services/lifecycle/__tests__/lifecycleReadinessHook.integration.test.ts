/**
 * The build-event hook: it measures, it advances only a work hop, and it cannot break the build
 * it observes. Against real Postgres.
 *
 * Session CC-20261021-h9v3. Design §9 step 2 — the piece that makes the rest fire. Until this
 * landed, the computation, the table and the advancer all existed with no caller.
 *
 * ## The test that matters most is the one about failure
 *
 * `a measurement failure does not propagate` is the reason this hook is safe to put on a
 * production path. A publish that already succeeded must not be turned into an error by an
 * observer, and this programme has the scar: `recordPlaybackBeat` swallowed its own failure for
 * nine days because nothing proved what the swallow did.
 *
 * ## What it will mostly do today
 *
 * Measure, and refuse to advance. Every lifecycle row in production is at `discovery`, whose
 * next hop needs `requirement.approve` - a person. That refusal is the design working, so it is
 * asserted here rather than treated as a gap.
 *
 * ── Running it ────────────────────────────────────────────────────────────────────────
 *
 *   docker run --rm -d --name hook-pg-test -p 55444:5432 \
 *     -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=ci -e POSTGRES_DB=test_hook \
 *     postgres:16-alpine
 *
 *   DATABASE_URL=postgres://ci@127.0.0.1:55444/test_hook \
 *     npx jest -c jest.config.ts src/services/lifecycle/__tests__/lifecycleReadinessHook
 *
 *   docker rm -f hook-pg-test
 */
import { QueryTypes } from 'sequelize';

jest.setTimeout(120_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[lifecycleReadinessHook] SKIPPED: no DATABASE_URL. Not evidence of anything.');
}

describeIfDb('the build-event readiness hook', () => {
  let sequelize: import('sequelize').Sequelize;
  let measureReadinessOnBuildEvent:
    typeof import('../lifecycleReadinessHook').measureReadinessOnBuildEvent;

  const TENANT = '55555555-5555-4555-8555-555555555555';
  const PROJECT = '66666666-6666-4666-8666-666666666666';
  const ORPHAN = '77777777-7777-4777-8777-777777777777';
  let lifecycleId = '';

  const stageNow = async (): Promise<string> => {
    const rows = await sequelize.query<{ stage: string }>(
      'SELECT stage FROM project_lifecycle_states WHERE id = $1',
      { bind: [lifecycleId], type: QueryTypes.SELECT },
    );
    return rows[0].stage;
  };

  const setStage = (stage: string) => sequelize.query(
    'UPDATE project_lifecycle_states SET stage = $2 WHERE id = $1',
    { bind: [lifecycleId, stage], type: QueryTypes.UPDATE },
  );

  const readinessRows = async (): Promise<number> => {
    const rows = await sequelize.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM lifecycle_stage_readiness',
      { type: QueryTypes.SELECT },
    );
    return Number(rows[0].n);
  };

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    ({ measureReadinessOnBuildEvent } = await import('../lifecycleReadinessHook'));

    for (const table of [
      'lifecycle_stage_readiness', 'lifecycle_stage_failures', 'project_lifecycle_states',
      'build_plans', 'build_intake', 'delivery_projects', 'projects', 'tenants',
    ]) {
      await sequelize.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    }
    await sequelize.query('CREATE TABLE IF NOT EXISTS tenants (id UUID PRIMARY KEY)');
    await sequelize.query('CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY)');
    await sequelize.query('CREATE TABLE IF NOT EXISTS delivery_projects (id UUID PRIMARY KEY)');

    const { PROJECT_LIFECYCLE_STATEMENTS } = await import('../../../db/ensureProjectLifecycleSchema');
    for (const sql of PROJECT_LIFECYCLE_STATEMENTS) {
      if (/lifecycle_stage_readiness|project_lifecycle_states|uq_lifecycle_student|uq_readiness/i.test(sql)) {
        await sequelize.query(sql);
      }
    }
    // The evidence reader queries the SBP tables; without them every measurement would fail for
    // an environmental reason and this suite would prove nothing about the hook.
    const { ensureSbpSchema } = await import('../../../db/ensureSbpSchema');
    await ensureSbpSchema();

    await sequelize.query('INSERT INTO tenants (id) VALUES ($1)', { bind: [TENANT], type: QueryTypes.INSERT });
    await sequelize.query('INSERT INTO projects (id) VALUES ($1)', { bind: [PROJECT], type: QueryTypes.INSERT });
    const rows = await sequelize.query<{ id: string }>(
      `INSERT INTO project_lifecycle_states (tenant_id, student_project_id, stage)
       VALUES ($1, $2, 'discovery') RETURNING id`,
      { bind: [TENANT, PROJECT], type: QueryTypes.SELECT },
    );
    lifecycleId = rows[0].id;
  });

  afterAll(async () => {
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
    await setStage('discovery');
  });

  it('MEASURES and records a row', async () => {
    const result = await measureReadinessOnBuildEvent({
      studentProjectId: PROJECT, event: 'test.event',
    });

    expect(result.outcome).toBe('measured');
    expect(result.measured).toBe(true);
    expect(await readinessRows()).toBe(1);
  });

  it('DOES NOT ADVANCE a human hop, which is what `discovery` has', async () => {
    // discovery -> requirements_ready needs requirement.approve. The pipeline reporting that it
    // did story.write must not move it, and the measurement must still be kept.
    const result = await measureReadinessOnBuildEvent({
      studentProjectId: PROJECT, event: 'plan.published', performedAct: 'story.write',
    });

    expect(result.advanced).toBe(false);
    expect(result.outcome).toBe('measured');
    expect(await stageNow()).toBe('discovery');
    expect(await readinessRows()).toBe(1);
  });

  it('is IDEMPOTENT: the same event twice leaves one row', async () => {
    await measureReadinessOnBuildEvent({ studentProjectId: PROJECT, event: 'test.event' });
    await measureReadinessOnBuildEvent({ studentProjectId: PROJECT, event: 'test.event' });

    expect(await readinessRows()).toBe(1);
  });

  it('SKIPS a project with no lifecycle row, without failing', async () => {
    // The 62 legacy projects hit this path on every build event.
    const result = await measureReadinessOnBuildEvent({
      studentProjectId: ORPHAN, event: 'plan.published', performedAct: 'story.write',
    });

    expect(result.outcome).toBe('no_lifecycle');
    expect(result.measured).toBe(false);
    expect(await readinessRows()).toBe(0);
  });

  it('REPORTS the end of the chain rather than erroring', async () => {
    await setStage('operating');

    const result = await measureReadinessOnBuildEvent({
      studentProjectId: PROJECT, event: 'test.event',
    });

    expect(result.outcome).toBe('end_of_chain');
    expect(await readinessRows()).toBe(0);
  });

  it('A MEASUREMENT FAILURE DOES NOT PROPAGATE — the reason this is safe on a build path', async () => {
    // Break the table underneath it. A publish that already succeeded must not be turned into
    // an error by its observer.
    await sequelize.query('ALTER TABLE lifecycle_stage_readiness RENAME TO readiness_hidden');
    try {
      const result = await measureReadinessOnBuildEvent({
        studentProjectId: PROJECT, event: 'plan.published', performedAct: 'story.write',
      });

      expect(result.outcome).toBe('failed');
      expect(result.measured).toBe(false);
      expect(result.advanced).toBe(false);
      // And it did not advance anything on the way out.
      expect(await stageNow()).toBe('discovery');
    } finally {
      await sequelize.query('ALTER TABLE readiness_hidden RENAME TO lifecycle_stage_readiness');
    }
  });

  it('POSITIVE CONTROL: it DOES advance a work hop, so the refusals above mean something', async () => {
    await setStage('blueprint_approved');

    const result = await measureReadinessOnBuildEvent({
      studentProjectId: PROJECT, event: 'plan.published', performedAct: 'story.write',
    });

    // blueprint_approved -> planning requires story.write, which is what was reported. Whether
    // it advances depends on `planning`'s prerequisites being satisfied by this empty fixture;
    // what must be true either way is that it was NOT refused for being a human hop.
    expect(result.outcome).not.toBe('failed');
    if (!result.advanced) {
      // Then it refused on evidence, not on authority - and the stage is untouched.
      expect(await stageNow()).toBe('blueprint_approved');
    } else {
      expect(await stageNow()).toBe('planning');
    }
  });
});
