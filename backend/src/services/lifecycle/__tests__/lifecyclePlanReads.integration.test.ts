import { QueryTypes, type Sequelize } from 'sequelize';

/**
 * P6-T5 — the read that feeds `launch_ready`, against a real Postgres.
 *
 * ## The one claim here that cannot be checked any other way
 *
 * `publishedPlanState` recomputes `hashCanonical(plan_json)` and compares it to the stored
 * `plan_sha256`. `savePlanDraft` computed that hash over an in-memory object and stored the
 * body with `CAST(:planJson AS jsonb)`. **JSONB is not a text column.** It erases key order,
 * normalises numbers, drops duplicate keys and rejects nothing on the way back out. If any of
 * that moved the bytes, every healthy project in production would read as `hashIntact: false`
 * and `launch_ready` would refuse all of them — a gate that blocks everything is as broken as
 * one that blocks nothing, and it would look like a working feature in every unit test.
 *
 * So the round trip is MEASURED here, through the real writer, not reasoned about from
 * `canonicalize`'s source. `hashCanonical` sorts keys recursively, which is why this is
 * expected to hold; expecting it is not the same as having seen it.
 *
 * ## Running it
 *
 *   docker exec acc-lifecycle-scratch-pg psql -U postgres -c 'CREATE DATABASE t5_publish;'
 *   DATABASE_URL=postgres://postgres:scratchlocal@localhost:55432/t5_publish \
 *     npx jest --no-cache --forceExit --runTestsByPath \
 *     src/services/lifecycle/__tests__/lifecyclePlanReads.integration.test.ts
 *
 * SKIPS VISIBLY without `DATABASE_URL`, for the same reason the concurrency suite does: a
 * green report from a suite that never connected is worse than no report.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[lifecyclePlanReads.integration] SKIPPED: no DATABASE_URL. The JSONB round-trip claim '
    + 'cannot be checked without a real Postgres.',
  );
}

const PROJECT = '88888888-8888-4888-8888-888888888888';
const ROW = { id: 'lc-integration-1', student_project_id: PROJECT };

/**
 * A plan whose keys are written in DELIBERATELY NON-ALPHABETICAL order, with a nested object
 * and a number, so the round trip is exercised rather than trivially survived. `canonicalize`
 * sorts keys, so a JSONB reordering must not change the hash — and that is the point.
 */
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

describeIfDb('publishedPlanState against a real build_plans table', () => {
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
    // lacks. Same preamble as the concurrency suite, for the same reason.
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

  it('THE JSONB ROUND TRIP HOLDS: a plan written by savePlanDraft reads back intact', async () => {
    await clear();
    const sha = await publishOne();

    expect(await publishedPlanState(ROW)).toMatchObject({
      publishedCount: 1,
      hashIntact: true,
    });

    // And the stored hash really is the one the writer computed, so the agreement above is
    // between two independent computations rather than one value compared with itself.
    const stored = await sequelize.query<{ plan_sha256: string }>(
      "SELECT plan_sha256 FROM build_plans WHERE project_id = $1 AND status = 'published'",
      { bind: [PROJECT], type: QueryTypes.SELECT },
    );
    expect(stored[0].plan_sha256).toBe(sha);
    expect(sha).toMatch(/^[0-9a-f]{64}$/);
  }, 60_000);

  it('returns the published plan BODY, not a draft', async () => {
    await clear();
    await publishOne();
    // A second draft, left unpublished. A reader that took MAX(version) regardless of status
    // would return this one, and a stage would then be judged against work nobody approved.
    await savePlanDraft(PROJECT, { ...PLAN, descriptor: 'UNAPPROVED' }, { gate: { ok: true, violations: [] } });

    const st = await publishedPlanState(ROW) as { plan: { descriptor: string }; publishedCount: number };
    expect(st.plan.descriptor).toBe('d');
    expect(st.publishedCount).toBe(1);
  }, 60_000);

  it('DETECTS A plan_json EDITED BEHIND ITS HASH — the failure a write-side guard cannot see', async () => {
    await clear();
    await publishOne();

    // `expectedSha` protects the invariant when the row is WRITTEN. This is the hole it cannot
    // cover: any script, any UPDATE, can change a JSONB column and leave `plan_sha256` alone.
    await sequelize.query(
      `UPDATE build_plans
          SET plan_json = jsonb_set(plan_json, '{descriptor}', '"TAMPERED"')
        WHERE project_id = $1 AND status = 'published'`,
      { bind: [PROJECT] },
    );

    expect(await publishedPlanState(ROW)).toMatchObject({ publishedCount: 1, hashIntact: false });
  }, 60_000);

  it('counts TWO published rows rather than reporting the newest as healthy', async () => {
    await clear();
    await publishOne();
    // Forced with raw SQL, because `publishPlan` can no longer produce this state — which is
    // the point of T5. The rows written BEFORE that fix are still in the table, so the read
    // has to recognise the state even though nothing can create it any more.
    const d2 = await savePlanDraft(PROJECT, { ...PLAN, descriptor: 'second' }, { gate: { ok: true, violations: [] } });
    await sequelize.query(
      "UPDATE build_plans SET status = 'published' WHERE project_id = $1 AND version = $2",
      { bind: [PROJECT, d2.version] },
    );

    expect(await publishedPlanState(ROW)).toMatchObject({ publishedCount: 2, hashIntact: true });
  }, 60_000);

  it('NOTHING PUBLISHED is a measured zero, not an unreadable row', async () => {
    await clear();
    await savePlanDraft(PROJECT, PLAN, { gate: { ok: true, violations: [] } });

    // `hashIntact: null` and NOT `false`: there is nothing to check. The distinction is what
    // keeps `publish_hash_mismatch` out of the gap list as a measured failure it is not.
    expect(await publishedPlanState(ROW)).toEqual({ plan: null, publishedCount: 0, hashIntact: null });
  }, 60_000);

  it('a DELIVERY project reads null without touching the database', async () => {
    expect(await publishedPlanState({ id: 'lc-2', student_project_id: null })).toBeNull();
  });

  it('a query that THROWS returns null and LOGS with an error_class', async () => {
    // The catch is load-bearing — an unreadable plan blocks five fields at once, so a silent
    // failure here would be both invisible and total. CLAUDE.md names the silent catch a
    // production defect, so the log line is part of the contract, not decoration.
    const lines: string[] = [];
    const spy = jest.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(String(a[0])); });
    const query = jest.spyOn(sequelize, 'query').mockRejectedValueOnce(
      Object.assign(new Error('relation "build_plans" does not exist'), { name: 'DatabaseError' }),
    );

    try {
      expect(await publishedPlanState(ROW)).toBeNull();
    } finally {
      query.mockRestore();
      spy.mockRestore();
    }

    const event = lines.map((l) => JSON.parse(l))
      .find((l) => l.event === 'lifecycle_evidence_plan_unavailable');
    expect(event).toMatchObject({
      level: 'warn', outcome: 'partial', error_class: 'DatabaseError',
      context: { lifecycle_id: 'lc-integration-1', measured: false },
    });
  }, 60_000);

  it('a violation LOGS as a ContractViolation, so production can find these rows', async () => {
    await clear();
    await publishOne();
    await sequelize.query(
      `UPDATE build_plans SET plan_json = jsonb_set(plan_json, '{descriptor}', '"X"')
        WHERE project_id = $1 AND status = 'published'`,
      { bind: [PROJECT] },
    );

    const lines: string[] = [];
    const spy = jest.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(String(a[0])); });
    try {
      await publishedPlanState(ROW);
    } finally {
      spy.mockRestore();
    }

    const event = lines.map((l) => JSON.parse(l))
      .find((l) => l.event === 'lifecycle_publish_integrity_violation');
    expect(event).toMatchObject({
      outcome: 'failure',
      error_class: 'ContractViolation',
      context: { published_count: 1, hash_intact: false },
    });
    // No plan content in the log. These lines go to container stdout and a build plan is
    // student work.
    expect(JSON.stringify(event)).not.toContain('descriptor');
  }, 60_000);
});
