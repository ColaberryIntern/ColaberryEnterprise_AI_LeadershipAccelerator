import { type Sequelize } from 'sequelize';

/**
 * P6-T5, split out of `lifecyclePlanReads.integration.test.ts` by L7.6.
 *
 * ## Why this is its own file
 *
 * This suite holds ONE test, and it is the only one of the original eight that the integration
 * tier cannot run. It forces a second `published` row into `build_plans` with raw SQL to
 * recreate a legacy state, and the real schema now REFUSES that write - a partial unique index
 * makes the state unreachable, which is arguably the point the test was making.
 *
 * That is a disagreement between the suite and the schema rather than a flake. But while it
 * lived alongside the other seven, the runner's named exclusion took all eight out of the tier,
 * so the JSONB round-trip - the one claim in that file that cannot be checked any other way -
 * had no executing proof anywhere, and `lifecycleEvidence.publishIntegrity.test.ts` delegates
 * to it in its own words.
 *
 * So the exclusion now names THIS file and the other seven run. The named exclusion is the
 * honest home for a test that disagrees with the schema: `scripts/ci/runIntegrationSuites.js`
 * fails if an excluded path stops existing, so this cannot rot into a record of something that
 * was quietly deleted.
 *
 * ## What would close it
 *
 * Either delete the test, on the ground that a state the schema can no longer produce is not
 * worth asserting; or keep it and build the legacy row the way production actually holds one,
 * which means reproducing a pre-index write rather than fighting the index. That is a decision
 * about what `publishedPlanState` owes to historical rows, not a test repair, so it is left
 * stated rather than guessed.
 *
 * ## Running it
 *
 *   docker exec acc-lifecycle-scratch-pg psql -U postgres -c 'CREATE DATABASE t5_twopub;'
 *   DATABASE_URL=postgres://postgres:scratchlocal@localhost:55432/t5_twopub \
 *     npx jest --no-cache --forceExit --runTestsByPath \
 *     src/services/lifecycle/__tests__/lifecyclePlanReadsTwoPublished.integration.test.ts
 *
 * SKIPS VISIBLY without `DATABASE_URL`: a green report from a suite that never connected is
 * worse than no report.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[lifecyclePlanReadsTwoPublished.integration] SKIPPED: no DATABASE_URL. The two-published '
    + 'state can only be forced against a real Postgres.',
  );
}

// A DIFFERENT project id from the sibling suite. The runner gives each suite its own database,
// so a collision is not possible today; a distinct id means it stays impossible if that ever
// changes, and makes the rows obviously this file's when someone is looking at a scratch table.
const PROJECT = '88888888-8888-4888-8888-888888888889';
const ROW = { id: 'lc-integration-2', student_project_id: PROJECT };

/** Same shape as the sibling suite's, so both exercise the same writer. */
const PLAN = {
  stories: [{
    id: 'S-1',
    workspace: { ref: 'WS-intake', kind: 'workspace' },
    release: 'r0',
    fulfills: ['REQ-1'],
    acceptance: ['Given a', 'When b', 'Trust c'],
  }],
  releases: [{ key: 'r0', week_end: 2, week_start: 1, name: 'n', goal: 'g', demo: 'd' }],
  requirements: [{ id: 'REQ-1', priority: 'must', kind: 'FUNC', statement: 's' }],
  descriptor: 'd',
  project_name: 'P',
};

describeIfDb('publishedPlanState sees a SECOND published row', () => {
  let sequelize: Sequelize;
  let publishedPlanState: (row: typeof ROW) => Promise<unknown>;
  let savePlanDraft: (p: string, plan: unknown, meta: unknown) => Promise<{ version: number; plan_sha256: string }>;
  let publishPlan: (p: string, v: number, sha: string) => Promise<unknown>;

  async function clear(): Promise<void> {
    await sequelize.query('DELETE FROM build_plans WHERE project_id = $1', { bind: [PROJECT] });
  }

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    ({ publishedPlanState } = await import('../lifecyclePlanReads') as never);
    ({ savePlanDraft, publishPlan } = await import('../../sbp/planStore') as never);
    const { ensureSbpSchema } = await import('../../../db/ensureSbpSchema');

    // `build_plans.project_id` carries a real FK to `projects`, which a disposable database
    // lacks. Same preamble as the sibling suite, for the same reason.
    await sequelize.query('CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY)');
    await sequelize.query('INSERT INTO projects (id) VALUES ($1) ON CONFLICT DO NOTHING', { bind: [PROJECT] });
    await ensureSbpSchema();
    await clear();
  }, 180_000);

  afterAll(async () => {
    if (!sequelize) return;
    await clear().catch(() => undefined);
    await sequelize.query('DELETE FROM projects WHERE id = $1', { bind: [PROJECT] }).catch(() => undefined);
    await sequelize.close();
  });

  /** Write and publish one plan through the REAL writers, returning its stored hash. */
  async function publishOne(plan: unknown = PLAN): Promise<string> {
    const draft = await savePlanDraft(PROJECT, plan, { gate: { ok: true, violations: [] } });
    await publishPlan(PROJECT, draft.version, draft.plan_sha256);
    return draft.plan_sha256;
  }

  it('counts TWO published rows rather than reporting the newest as healthy', async () => {
    await clear();
    await publishOne();
    // Forced with raw SQL, because `publishPlan` can no longer produce this state - which is
    // the point of T5. The rows written BEFORE that fix are still in the table, so the read
    // has to recognise the state even though nothing can create it any more.
    //
    // AND THIS IS WHY THE SUITE IS EXCLUDED: the partial unique index now refuses this UPDATE
    // too, so the test cannot build the state it needs. See the header.
    const d2 = await savePlanDraft(PROJECT, { ...PLAN, descriptor: 'second' }, { gate: { ok: true, violations: [] } });
    await sequelize.query(
      "UPDATE build_plans SET status = 'published' WHERE project_id = $1 AND version = $2",
      { bind: [PROJECT, d2.version] },
    );

    expect(await publishedPlanState(ROW)).toMatchObject({ publishedCount: 2, hashIntact: true });
  }, 60_000);
});
