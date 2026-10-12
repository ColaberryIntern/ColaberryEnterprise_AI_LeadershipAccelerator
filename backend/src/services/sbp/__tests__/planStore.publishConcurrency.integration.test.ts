import { QueryTypes, type Sequelize } from 'sequelize';

/**
 * P6-T5 — LC-13: concurrent publishes cannot duplicate, erase, or silently publish.
 *
 * ## The hazard was real before this task, and it is demonstrable
 *
 * `publishPlan` ran two autocommitting statements: set one version `published`, then supersede the
 * others. The plan's acceptance asks for "the mandatory positive control: drop the constraint that
 * makes it impossible and show the race then produces the duplicate."
 *
 * THERE WAS NO CONSTRAINT TO DROP WHEN THIS FILE WAS WRITTEN. `(project_id, version)` is
 * unique, so one row per version — but nothing prevented two rows for the same project both
 * carrying `status = 'published'`, and this file originally demonstrated the failing state
 * directly rather than by disabling a guard.
 *
 * P6-T5 then added the guard: `build_plans_one_published_per_project`, a partial unique index.
 * So the control the plan asked for is now performable, and the test below performs it in both
 * directions — drop the index and the duplicate returns, restore it and the database refuses
 * the second publish outright.
 *
 * TWO HALVES, BOTH NEEDED. The index makes the state impossible; `publishPlan`'s row lock makes
 * the LOSER return the winner's row instead of an error, so a student sees a published plan
 * rather than a 500. Each is tested separately below, because either alone would look like a
 * fix in a test that only counted rows.
 *
 * ## Running it
 *
 *   docker exec acc-lifecycle-scratch-pg psql -U postgres -c 'CREATE DATABASE t5_publish;'
 *   DATABASE_URL=postgres://postgres:scratchlocal@localhost:55432/t5_publish  *     npx jest --no-cache --forceExit --runTestsByPath  *     src/services/sbp/__tests__/planStore.publishConcurrency.integration.test.ts
 *
 * SKIPS VISIBLY without `DATABASE_URL`: a concurrency claim that reports green without a database
 * is worse than no claim, because this is the one property that cannot be checked by reading code.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[planStore.publishConcurrency] SKIPPED: no DATABASE_URL. This is LC-13\'s only executable '
    + 'evidence — a race cannot be verified by reading the source.',
  );
}

const PROJECT = '99999999-9999-4999-8999-999999999999';

describeIfDb('P6-T5 — publishPlan under concurrency', () => {
  let sequelize: Sequelize;
  let publishPlan: (p: string, v: number, expected: string) => Promise<unknown>;
  let getPublishedPlan: (p: string) => Promise<unknown | null>;

  async function statuses(): Promise<Array<{ version: number; status: string }>> {
    return sequelize.query<{ version: number; status: string }>(
      'SELECT version, status FROM build_plans WHERE project_id = $1 ORDER BY version',
      { bind: [PROJECT], type: QueryTypes.SELECT },
    );
  }

  async function publishedCount(): Promise<number> {
    const r = await sequelize.query<{ n: string }>(
      "SELECT count(*) AS n FROM build_plans WHERE project_id = $1 AND status = 'published'",
      { bind: [PROJECT], type: QueryTypes.SELECT },
    );
    return Number(r[0].n);
  }

  /**
   * The reviewed hash of version `v`, as `seedTwoDrafts` stores it.
   *
   * EVERY `publishPlan` CALL BELOW MUST SUPPLY IT. `expectedSha` became a required argument
   * later in this same task, and this suite was not re-run in between — so every call here was
   * throwing `HashMismatch`, the `.catch(() => undefined)` in the race loop was swallowing it,
   * and the "10 of 10 rounds" result I had recorded was measuring nothing at all. The evidence
   * was true when taken and stale when quoted, which is the whole argument for re-running a
   * suite after the last edit rather than after the edit that motivated it.
   */
  const sha = (v: number) => `${v}`.repeat(64).slice(0, 64);

  /** Two draft versions, both gate-clean, nothing published. */
  async function seedTwoDrafts(): Promise<void> {
    await sequelize.query('DELETE FROM build_plans WHERE project_id = $1', { bind: [PROJECT] });
    for (const v of [1, 2]) {
      await sequelize.query(
        `INSERT INTO build_plans (project_id, version, status, plan_json, plan_sha256, gate_ok)
         VALUES ($1, $2, 'draft', '{}'::jsonb, $3, TRUE)`,
        { bind: [PROJECT, v, sha(v)] },
      );
    }
  }

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    ({ publishPlan, getPublishedPlan } = await import('../planStore') as never);
    const { ensureSbpSchema } = await import('../../../db/ensureSbpSchema');

    // `build_plans.project_id` carries a real FK to `projects`, which a disposable database lacks.
    await sequelize.query('CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY)');
    await sequelize.query('INSERT INTO projects (id) VALUES ($1) ON CONFLICT DO NOTHING', { bind: [PROJECT] });
    await ensureSbpSchema();
  }, 180_000);

  afterAll(async () => {
    if (!sequelize) return;
    await sequelize.query('DELETE FROM build_plans WHERE project_id = $1', { bind: [PROJECT] }).catch(() => undefined);
    await sequelize.query('DELETE FROM projects WHERE id = $1', { bind: [PROJECT] }).catch(() => undefined);
    await sequelize.close();
  });

  const PARTIAL_UNIQUE = 'build_plans_one_published_per_project';

  /** Every index definition on `build_plans`, one entry each. */
  async function indexDefs(): Promise<string[]> {
    const idx = await sequelize.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE tablename = 'build_plans'",
      { type: QueryTypes.SELECT },
    );
    return idx.map((i) => i.indexdef);
  }

  /** The partial index's own definition, or undefined when it is not there. */
  async function partialDef(): Promise<string | undefined> {
    return (await indexDefs()).find((d) => d.includes(PARTIAL_UNIQUE));
  }

  it('the apparatus is real: build_plans exists and NOW carries published-uniqueness', async () => {
    // THIS ASSERTION USED TO BE ITS OWN OPPOSITE. It read "...and has no published-uniqueness
    // constraint", with a comment recording that the plan's "mandatory positive control: drop
    // the constraint that makes it impossible" had nothing to drop. P6-T5 added the constraint,
    // so the control is now possible — and the test below performs it in both directions.
    await seedTwoDrafts();
    expect((await statuses()).map((r) => r.version)).toEqual([1, 2]);

    const defs = await indexDefs();
    expect(defs.some((d) => d.includes('build_plans_unique_project_version'))).toBe(true);

    // PARTIAL, not total: many drafts per project are legitimate and a plain unique index on
    // project_id would refuse the second one. Both halves of ITS OWN definition are asserted,
    // because a name match alone would pass for either kind of index.
    const partial = await partialDef();
    expect(partial).toContain('UNIQUE INDEX');
    // As Postgres RENDERS it, which is not as it was written: `WHERE ((status)::text =
    // 'published'::text)`. Asserting the source text would have failed against a correct index.
    expect(partial).toContain('WHERE (');
    expect(partial).toContain("'published'");
    expect(partial).toContain('(project_id)');

    // And `ensureSbpSchema` KNOWS it is required, so a database missing it reports a
    // SchemaInvariantViolation rather than silently permitting the duplicate again.
    const { REQUIRED_INDEXES } = await import('../../../db/ensureSbpSchema');
    expect([...REQUIRED_INDEXES]).toContain(PARTIAL_UNIQUE);
  });

  it('THE POSITIVE CONTROL, BOTH WAYS: drop the index and the hazard returns; restore it and the database refuses', async () => {
    // The interleaving the two former autocommitting statements admitted, with A publishing v1
    // and B publishing v2:
    //
    //     A: publish v1 | B: publish v2 | A: supersede != v1 | B: supersede != v2
    //
    // After the first two statements TWO rows are published - the duplicate. After all four,
    // ZERO are - the erase, and the worse of the two, because every reader treats absence as
    // "not published yet": `getPublishedPlan` returns null and the project reads as never
    // having published at all.
    //
    // Deliberately NOT calling `publishPlan`: this drives the raw statements, so it measures
    // what the DATABASE permits rather than what the service does. That is what makes it a
    // control for the index specifically, independent of the row lock.
    const pub = (v: number) => sequelize.query(
      "UPDATE build_plans SET status = 'published', published_at = NOW() WHERE project_id = $1 AND version = $2",
      { bind: [PROJECT, v] },
    );
    const sup = (v: number) => sequelize.query(
      "UPDATE build_plans SET status = 'superseded' WHERE project_id = $1 AND version <> $2 AND status = 'published'",
      { bind: [PROJECT, v] },
    );

    // ── DIRECTION 1: without the index, the end state is reachable ──────────────────────
    await sequelize.query(`DROP INDEX ${PARTIAL_UNIQUE}`);
    try {
      expect(await partialDef()).toBeUndefined();                // the drop actually happened
      await seedTwoDrafts();
      await pub(1);
      await pub(2);
      expect(await publishedCount()).toBe(2);                    // the DUPLICATE
      await sup(1);
      await sup(2);
      expect(await publishedCount()).toBe(0);                    // the ERASE, and durable
    } finally {
      // Restored in `finally` so a failure above cannot leave the rest of this suite running
      // against an unconstrained table and reporting green for the wrong reason.
      await seedTwoDrafts();
      await sequelize.query(
        `CREATE UNIQUE INDEX ${PARTIAL_UNIQUE} ON build_plans (project_id) WHERE status = 'published'`,
      );
    }

    // ── DIRECTION 2: with the index, the same sequence cannot complete ──────────────────
    expect(await partialDef()).toBeDefined();
    await seedTwoDrafts();
    await pub(1);
    // The second publish is REFUSED BY THE DATABASE, not by application code. This is the
    // assertion the plan asked for and the one that could not exist before T5.
    // Sequelize re-wraps the Postgres error, and its `message` is the unhelpful "Validation
    // error" — matching on that text would pass for any validation failure at all. The NAME and
    // the ORIGINAL message are what identify this as our index refusing the write.
    await expect(pub(2)).rejects.toMatchObject({ name: 'SequelizeUniqueConstraintError' });
    const err = await pub(2).catch((e: { parent?: { message?: string } }) => e);
    expect((err as { parent?: { message?: string } }).parent?.message).toContain(PARTIAL_UNIQUE);
    expect(await publishedCount()).toBe(1);
  }, 60_000);

  it('THE FIX: two concurrent publishes leave exactly one published, every time', async () => {
    // Ten rounds, because one round can serialise by luck and prove nothing. Each round races a
    // publish of v1 against a publish of v2 through the REAL function.
    for (let round = 0; round < 10; round += 1) {
      await seedTwoDrafts();
      await Promise.all([
        publishPlan(PROJECT, 1, sha(1)).catch(() => undefined),
        publishPlan(PROJECT, 2, sha(2)).catch(() => undefined),
      ]);

      const n = await publishedCount();
      // Named, not counted: a bare toBe(1) would not say which round broke or how.
      expect({ round, published: n, rows: await statuses() }).toMatchObject({ round, published: 1 });
    }
    // 90s, because this is a multi-round concurrency test against a Dockerised Postgres where a
    // single round costs a few hundred milliseconds. The default 5s timeout killed it mid-run
    // and reported a FAILURE where the property held - a timeout on a slow apparatus reads
    // exactly like a broken invariant, which is its own small lesson about evidence.
  }, 90_000);

  it('a replayed publish of the SAME version is idempotent, not a second write', async () => {
    // The retry case LC-13 names alongside concurrency. Two calls for the same version must leave
    // one published row and must not move `published_at`.
    await seedTwoDrafts();
    await publishPlan(PROJECT, 1, sha(1));
    const first = await sequelize.query<{ published_at: string }>(
      'SELECT published_at FROM build_plans WHERE project_id = $1 AND version = 1',
      { bind: [PROJECT], type: QueryTypes.SELECT },
    );
    await publishPlan(PROJECT, 1, sha(1));
    const second = await sequelize.query<{ published_at: string }>(
      'SELECT published_at FROM build_plans WHERE project_id = $1 AND version = 1',
      { bind: [PROJECT], type: QueryTypes.SELECT },
    );

    expect(await publishedCount()).toBe(1);
    expect(second[0].published_at).toEqual(first[0].published_at);
  });

  it('refuses a publish whose reviewed hash no longer matches, and changes nothing', async () => {
    // The "silently publish unapproved work" half of LC-13. Supplying the hash the reviewer saw
    // turns "the reviewed plan is the published plan" into an enforced invariant — and a refusal
    // must leave the row untouched, not half-published.
    await seedTwoDrafts();
    await expect(publishPlan(PROJECT, 1, 'f'.repeat(64))).rejects.toThrow(/HashMismatch|changed since review/);
    expect(await publishedCount()).toBe(0);
    expect((await statuses()).every((r) => r.status === 'draft')).toBe(true);
  });
});
