/**
 * P7-T3 case 5 — a partial provider failure preserves a draft but must NOT advance an approved
 * stage. **LC-13, DB-backed.**
 *
 * The invariant is `request.md:123`, verbatim:
 *
 * > *"A model/tool failure may preserve a draft but must not advance an approved stage."*
 *
 * ## What is already true STRUCTURALLY, and is therefore not re-tested here
 *
 * `lifecycleExecution.ts` cannot advance a stage at all: it imports no Sequelize, no model and
 * no query, and its whole persistence surface is `get`/`put`/`deadLetter` over `StageRun`. The
 * journey suite says so in its own body and admits the assertion it guards **cannot fail**. A
 * test asserting it again would be a test of nothing, so this file does not add one.
 *
 * The generation half is also ordered correctly by construction
 * (`sbpOrchestrator.runGeneration`): the model calls happen first, `savePlanDraft` writes the
 * draft at `:340`, the status moves at `:343`, and the publish decision is LAST at `:370-380`.
 * A throw anywhere in the model steps lands in the catch at `:381`, which sets `failed`. No
 * publish is reachable from a provider error. That ordering is covered at the unit tier.
 *
 * ## What had no coverage, and is what this file adds
 *
 * Whether the DRAFT SURVIVES in Postgres, and whether a failed build leaves anything published.
 * The unit tier asserts against a mocked `planStore`, so it cannot observe either. "Preserves a
 * draft" is a claim about a row.
 *
 * ## Running it
 *
 *   docker run --rm -d --name sbp-provider-pg -p 55437:5432 \
 *     -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=sbp_test \
 *     pgvector/pgvector:pg15
 *
 *   DATABASE_URL=postgres://test:test@localhost:55437/sbp_test \
 *     npx jest -c jest.config.ts providerFailure.integration
 *
 *   docker rm -f sbp-provider-pg
 */
import { QueryTypes } from 'sequelize';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[providerFailure.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('LC-13 case 5 — a provider failure keeps the draft and publishes nothing', () => {
  let sequelize: import('sequelize').Sequelize;
  let saveIntake: typeof import('../planStore').saveIntake;
  let savePlanDraft: typeof import('../planStore').savePlanDraft;
  let getPlan: typeof import('../planStore').getPlan;
  let getIntake: typeof import('../planStore').getIntake;
  let ensureSbpSchema: typeof import('../../../db/ensureSbpSchema').ensureSbpSchema;

  const PROJECT = '71111111-1111-1111-1111-111111111111';
  const ENROLLMENT = '72222222-2222-2222-2222-222222222222';

  /** The smallest plan `savePlanDraft` will accept; shape, not content, is what matters here. */
  const PLAN = {
    descriptor: 'Seat management',
    requirements: [{ id: 'REQ-001', statement: 'A manager can build a roster.', kind: 'FUNC', priority: 'must', cluster: 'Roster' }],
    releases: [{ key: 'r0', name: 'Skeleton', goal: 'g', demo: 'd', week_start: 1, week_end: 2 }],
    stories: [{
      id: 'STORY-001', release: 'r0', title: 'Manager builds a roster',
      narrative: 'As a manager, I want to add employees, so that I can buy seats.',
      fulfills: ['REQ-001'], owner_agent: 'Roster',
      acceptance: ['Given a, when b, then c.', 'Given d, when e, then f.', 'Trust - audited.'],
      task_guidance: 'Build the roster endpoint.', failure_paths: ['duplicate email'], blocked_by: [],
    }],
  };

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    ({ saveIntake, savePlanDraft, getPlan, getIntake } = await import('../planStore'));
    ({ ensureSbpSchema } = await import('../../../db/ensureSbpSchema'));

    await sequelize.query(`CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY)`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)`);
    await sequelize.query(`INSERT INTO projects (id) VALUES ($1) ON CONFLICT DO NOTHING`, { bind: [PROJECT] });
    await sequelize.query(
      `INSERT INTO enrollments (id) VALUES ($1) ON CONFLICT DO NOTHING`, { bind: [ENROLLMENT] },
    );
    await ensureSbpSchema();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await sequelize.query(`DELETE FROM build_plans WHERE project_id = $1`, { bind: [PROJECT] });
    await sequelize.query(`DELETE FROM build_intake WHERE project_id = $1`, { bind: [PROJECT] });
  });

  async function countByStatus(status: string): Promise<number> {
    const rows = await sequelize.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM build_plans WHERE project_id = $1 AND status = $2`,
      { bind: [PROJECT, status], type: QueryTypes.SELECT },
    );
    return Number(rows[0].n);
  }

  it('THE INVARIANT: a failed build keeps its draft and publishes nothing', async () => {
    // The sequence `runGeneration` performs: draft written first, then the status moves. A
    // provider failure after the draft is exactly this state.
    await saveIntake({ project_id: PROJECT, enrollment_id: ENROLLMENT, idea: 'seats', status: 'generating' });
    await savePlanDraft(PROJECT, PLAN as never, { gate: { ok: true, violations: [] }, model: 'gpt-4o', attempts: 1 });
    await saveIntake({
      project_id: PROJECT, enrollment_id: ENROLLMENT, idea: 'seats', status: 'failed',
      last_error: { error_class: 'UpstreamUnavailable', message: 'model timed out', at: new Date().toISOString() },
    });

    // The draft SURVIVED -- the student has not lost the work.
    const plan = await getPlan(PROJECT);
    expect(plan).toBeTruthy();
    expect(plan?.status).toBe('draft');

    // And nothing advanced: no published row exists at all.
    expect(await countByStatus('published')).toBe(0);

    // The failure is legible, with a class rather than a bare message.
    const intake = await getIntake(PROJECT);
    expect(intake?.status).toBe('failed');
    expect(intake?.last_error?.error_class).toBe('UpstreamUnavailable');
  });

  it('the evidence layer reports the absence as NOT MEASURED, not as a clean pass', async () => {
    /**
     * The half that makes this more than a row count. `publishedPlanIsSingular` and
     * `publishedPlanHashIntact` are EVIDENCE, not enforcers, and with nothing published they
     * must report **unmeasured** rather than `false` -- because "no published plan" is not the
     * same fact as "the published plan is wrong", and a gate that conflated them would block a
     * launch for the wrong reason and tell the reader the wrong thing.
     */
    await saveIntake({ project_id: PROJECT, enrollment_id: ENROLLMENT, idea: 'seats', status: 'failed' });
    await savePlanDraft(PROJECT, PLAN as never, { gate: { ok: true, violations: [] }, model: 'gpt-4o', attempts: 1 });

    const { publishedPlanState } = await import('../../lifecycle/lifecyclePlanReads');
    const facts = await publishedPlanState({ id: 'ls-x', student_project_id: PROJECT });

    expect(facts?.publishedCount).toBe(0);
    // `null` is the NOT_MEASURED signal: there is no published plan whose hash could be intact.
    expect(facts?.hashIntact).toBeNull();
    expect(facts?.plan).toBeNull();
  });

  it('CONTROL: with a plan actually published, the same reads report a measured result', async () => {
    // Without this, the test above would pass against a reader that always returned 0 and null.
    await saveIntake({ project_id: PROJECT, enrollment_id: ENROLLMENT, idea: 'seats', status: 'drafted' });
    const draft = await savePlanDraft(PROJECT, PLAN as never, { gate: { ok: true, violations: [] }, model: 'gpt-4o', attempts: 1 });
    const { publishPlan } = await import('../planStore');
    await publishPlan(PROJECT, draft.version, draft.plan_sha256);

    const { publishedPlanState } = await import('../../lifecycle/lifecyclePlanReads');
    const facts = await publishedPlanState({ id: 'ls-x', student_project_id: PROJECT });

    expect(facts?.publishedCount).toBe(1);
    expect(facts?.hashIntact).toBe(true);
    expect(await countByStatus('published')).toBe(1);
  });
});
