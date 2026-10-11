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
 * THERE WAS NO CONSTRAINT TO DROP. `(project_id, version)` is unique, so one row per version — but
 * nothing prevented two rows for the same project both carrying `status = 'published'`. So the
 * control is stronger than the one the plan imagined: the failing state is reachable against the
 * schema AS IT SHIPS, and this file demonstrates it directly rather than by disabling a guard.
 *
 * The interleaving, with A publishing v1 and B publishing v2:
 *
 *     A: publish v1 | B: publish v2 | A: supersede != v1 | B: supersede != v2
 *
 * After the first two statements TWO rows are published — the duplicate. After all four, ZERO are
 * — the erase, and the worse of the two, because every reader treats absence as "not published
 * yet". `getPublishedPlan` returns null and the project reads as never having published at all.
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
  let publishPlan: (p: string, v: number, sha?: string) => Promise<unknown>;
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

  /** Two draft versions, both gate-clean, nothing published. */
  async function seedTwoDrafts(): Promise<void> {
    await sequelize.query('DELETE FROM build_plans WHERE project_id = $1', { bind: [PROJECT] });
    for (const v of [1, 2]) {
      await sequelize.query(
        `INSERT INTO build_plans (project_id, version, status, plan_json, plan_sha256, gate_ok)
         VALUES ($1, $2, 'draft', '{}'::jsonb, $3, TRUE)`,
        { bind: [PROJECT, v, `${v}`.repeat(64).slice(0, 64)] },
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

  it('the apparatus is real: build_plans exists and has no published-uniqueness constraint', async () => {
    // Both halves matter. If the table were missing, every assertion below would fail for the wrong
    // reason; and if a uniqueness constraint already existed, the hazard demonstration would be
    // testing a guard rather than its absence.
    await seedTwoDrafts();
    expect((await statuses()).map((r) => r.version)).toEqual([1, 2]);

    const idx = await sequelize.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE tablename = 'build_plans'",
      { type: QueryTypes.SELECT },
    );
    const defs = idx.map((i) => i.indexdef).join('\n');
    expect(defs).toContain('build_plans_unique_project_version');
    // The gap this task closes: nothing makes a second `published` row impossible.
    expect(defs).not.toMatch(/UNIQUE[\s\S]*status = 'published'/);
  });

  it('THE HAZARD, demonstrated against the shipped statement sequence', async () => {
    // Deliberately NOT calling publishPlan: this reproduces the interleaving its two former
    // autocommitting statements admitted, to show the end state was reachable. The statements are
    // the ones the fix moved inside a transaction, which is why the assertion below is about the
    // SEQUENCE rather than about the function.
    await seedTwoDrafts();
    const pub = (v: number) => sequelize.query(
      "UPDATE build_plans SET status = 'published', published_at = NOW() WHERE project_id = $1 AND version = $2",
      { bind: [PROJECT, v] },
    );
    const sup = (v: number) => sequelize.query(
      "UPDATE build_plans SET status = 'superseded' WHERE project_id = $1 AND version <> $2 AND status = 'published'",
      { bind: [PROJECT, v] },
    );

    await pub(1);
    await pub(2);
    // The DUPLICATE, transiently visible to any reader between the two halves.
    expect(await publishedCount()).toBe(2);

    await sup(1);
    await sup(2);
    // The ERASE, and the durable end state. A project that published reads as never having done so.
    expect(await publishedCount()).toBe(0);
  });

  it('THE FIX: two concurrent publishes leave exactly one published, every time', async () => {
    // Ten rounds, because one round can serialise by luck and prove nothing. Each round races a
    // publish of v1 against a publish of v2 through the REAL function.
    for (let round = 0; round < 10; round += 1) {
      await seedTwoDrafts();
      await Promise.all([
        publishPlan(PROJECT, 1).catch(() => undefined),
        publishPlan(PROJECT, 2).catch(() => undefined),
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
    await publishPlan(PROJECT, 1);
    const first = await sequelize.query<{ published_at: string }>(
      'SELECT published_at FROM build_plans WHERE project_id = $1 AND version = 1',
      { bind: [PROJECT], type: QueryTypes.SELECT },
    );
    await publishPlan(PROJECT, 1);
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
