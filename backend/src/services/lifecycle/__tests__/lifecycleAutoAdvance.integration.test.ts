/**
 * The automatic advance actually moves a stage, actually refuses an approval, and its
 * compare-and-swap actually holds. Against real Postgres.
 *
 * Session CC-20261021-h9v3. Design §3.
 *
 * `lifecycleAutoAdvance.test.ts` proves the DECISION refuses approvals. This proves the whole
 * command end to end, because a decision that refuses correctly is worth nothing if the write
 * beside it advances anyway - and that is precisely the gap between a pure function and a
 * feature. The approval case is therefore repeated here against a real row: the stage must be
 * unchanged in the database afterwards, not merely reported as refused.
 *
 * The FK parents are deliberate stubs, as in the readiness persistence suite: nothing about a
 * stage transition depends on what a tenant or a project contains.
 *
 * ── Running it ────────────────────────────────────────────────────────────────────────
 *
 *   docker run --rm -d --name autoadvance-pg-test -p 55443:5432 \
 *     -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=ci -e POSTGRES_DB=test_autoadvance \
 *     postgres:16-alpine
 *
 *   DATABASE_URL=postgres://ci@127.0.0.1:55443/test_autoadvance \
 *     npx jest -c jest.config.ts src/services/lifecycle/__tests__/lifecycleAutoAdvance.integration
 *
 *   docker rm -f autoadvance-pg-test
 *
 * In CI this runs in the `Integration tier (Postgres)` job. With no `DATABASE_URL` it SKIPS.
 */
import { QueryTypes } from 'sequelize';

jest.setTimeout(120_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[lifecycleAutoAdvance.integration] SKIPPED: no DATABASE_URL. It is NOT evidence that an '
    + 'approval stage stays put unless it actually ran.',
  );
}

describeIfDb('the automatic advance, end to end', () => {
  let sequelize: import('sequelize').Sequelize;
  let autoAdvance: typeof import('../lifecycleAutoAdvance').autoAdvance;
  let readinessFor: typeof import('../lifecycleReadiness').readinessFor;
  let completeEvidence: typeof import('./evidenceFixture').completeEvidence;

  const TENANT = '33333333-3333-4333-8333-333333333333';
  const PROJECT = '44444444-4444-4444-8444-444444444444';
  let lifecycleId = '';

  /** Readiness for the hop out of `from`, forced satisfied. */
  const readyOut = (to: Parameters<typeof readinessFor>[0]) => ({
    ...readinessFor(to, completeEvidence()),
    satisfied: true,
    blocking: [],
  });

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

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    ({ autoAdvance } = await import('../lifecycleAutoAdvance'));
    ({ readinessFor } = await import('../lifecycleReadiness'));
    ({ completeEvidence } = await import('./evidenceFixture'));

    // Clean first as well as last: a teardown that dies partway otherwise leaves a row that
    // violates uq_lifecycle_student_project on the next run. Learned the hard way.
    for (const table of [
      'lifecycle_stage_readiness', 'lifecycle_stage_failures', 'project_lifecycle_states',
      'delivery_projects', 'projects', 'tenants',
    ]) {
      await sequelize.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    }
    await sequelize.query('CREATE TABLE IF NOT EXISTS tenants (id UUID PRIMARY KEY)');
    await sequelize.query('CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY)');
    await sequelize.query('CREATE TABLE IF NOT EXISTS delivery_projects (id UUID PRIMARY KEY)');

    const { PROJECT_LIFECYCLE_STATEMENTS } = await import('../../../db/ensureProjectLifecycleSchema');
    for (const sql of PROJECT_LIFECYCLE_STATEMENTS) {
      if (/project_lifecycle_states|uq_lifecycle_student/i.test(sql)) await sequelize.query(sql);
    }

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

  it('ADVANCES a work hop and the database agrees', async () => {
    await setStage('design_ready');

    const decision = await autoAdvance({
      lifecycleStateId: lifecycleId,
      from: 'design_ready',
      performedAct: 'project.write',
      readiness: readyOut('awaiting_blueprint_approval'),
    });

    expect(decision.allowed).toBe(true);
    expect(await stageNow()).toBe('awaiting_blueprint_approval');
  });

  it('LEAVES AN APPROVAL STAGE EXACTLY WHERE IT WAS, in the database', async () => {
    // The decision suite proves this is refused. This proves nothing moved anyway - the gap
    // between a pure function and a feature.
    await setStage('awaiting_blueprint_approval');

    const decision = await autoAdvance({
      lifecycleStateId: lifecycleId,
      from: 'awaiting_blueprint_approval',
      performedAct: 'contract.approve',
      readiness: readyOut('blueprint_approved'),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.refusal).toBe('not_a_work_hop');
    expect(await stageNow()).toBe('awaiting_blueprint_approval');
  });

  it('REFUSES an unready work hop, and leaves the stage alone', async () => {
    await setStage('plan_ready');

    const decision = await autoAdvance({
      lifecycleStateId: lifecycleId,
      from: 'plan_ready',
      performedAct: 'story.execute',
      readiness: {
        ...readinessFor('building', completeEvidence()),
        satisfied: false,
        blocking: [{ rule: 'no_requirements', kind: 'unmet', message: 'forced' }],
      },
    });

    expect(decision.refusal).toBe('not_ready');
    expect(await stageNow()).toBe('plan_ready');
  });

  it('THE COMPARE-AND-SWAP HOLDS: two concurrent advances, one winner', async () => {
    await setStage('blueprint_approved');

    const attempt = () => autoAdvance({
      lifecycleStateId: lifecycleId,
      from: 'blueprint_approved',
      performedAct: 'story.write',
      readiness: readyOut('planning'),
    });

    const [a, b] = await Promise.all([attempt(), attempt()]);
    const outcomes = [a, b];

    expect(outcomes.filter((d) => d.allowed)).toHaveLength(1);
    expect(outcomes.filter((d) => d.refusal === 'stage_moved')).toHaveLength(1);
    expect(await stageNow()).toBe('planning');
  });

  it('is IDEMPOTENT: advancing again from the stage it already left changes nothing', async () => {
    await setStage('blueprint_approved');
    await autoAdvance({
      lifecycleStateId: lifecycleId,
      from: 'blueprint_approved',
      performedAct: 'story.write',
      readiness: readyOut('planning'),
    });

    const again = await autoAdvance({
      lifecycleStateId: lifecycleId,
      from: 'blueprint_approved',
      performedAct: 'story.write',
      readiness: readyOut('planning'),
    });

    expect(again.refusal).toBe('stage_moved');
    expect(await stageNow()).toBe('planning');
  });
});
