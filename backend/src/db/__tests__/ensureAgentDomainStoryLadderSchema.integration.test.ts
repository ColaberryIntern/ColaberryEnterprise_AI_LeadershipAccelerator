/**
 * The ladder schema post-condition, against a REAL Postgres holding MORE THAN ONE schema.
 *
 * ## Why this suite exists
 *
 * On 2026-11-01, the first production boot after `ensureAgentDomainStoryLadderSchema` shipped, all
 * four of its statements succeeded -- `public.student_tasks.story_id` really was `varchar(120)` --
 * and its own assert reported the opposite at `level: 'error'`, with an `impact` line stating that
 * the release migration must not run. It had queried `information_schema.columns` filtered on
 * `table_name` alone, and that database holds THREE tables named `student_tasks`: `public`, plus
 * the frozen backups `snap_quincy_20260819` and `snap_quincy_20260819_after`. The statements are
 * unqualified and so correctly touched only `public`; the query saw every schema.
 *
 * A mocked `sequelize.query` cannot catch this. The mock returns whatever rows the test author
 * imagined, and the author who writes a one-row fixture has already assumed away the bug. Only a
 * real server with a second schema in it disagrees.
 *
 * ## It carries mandatory negative controls
 *
 * The test that proves the fix works would pass just as happily against a database with no second
 * schema in it, proving nothing. So one test runs the PRE-FIX query shape and requires it to come
 * back ambiguous, and two more require the assert to still FAIL on a genuinely broken `public` --
 * because a `table_schema` filter is also exactly how someone would accidentally disable the
 * check. If any control stops failing, nothing above it is evidence.
 *
 * ── Running it ────────────────────────────────────────────────────────────────────────
 *
 *   docker run --rm -d --name pg-ladder-schema -p 55442:5432 \
 *     -e POSTGRES_PASSWORD=pw postgres:16-alpine
 *
 *   # from backend/, once pg_isready reports "accepting connections":
 *   DATABASE_URL=postgres://postgres:pw@localhost:55442/postgres \
 *     npx jest -c jest.config.ts ensureAgentDomainStoryLadderSchema.integration
 *
 *   docker rm -f pg-ladder-schema
 *
 * Port 55442 so it cannot collide with the other ladder suite's container. Throwaway credentials
 * for a container that lives for one test run. With no `DATABASE_URL` the suite SKIPS and says so.
 * It must never be pointed at production: it CREATEs and DROPs a schema and rewrites column types.
 */
import { QueryTypes } from 'sequelize';

jest.setTimeout(120_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[ensureAgentDomainStoryLadderSchema.integration] SKIPPED: no DATABASE_URL. These are the '
    + 'only tests that can catch a schema-unqualified introspection query, because a mocked '
    + 'query returns the rows the test author imagined. CI runs them in the integration tier.',
  );
}

/** The shape production had BEFORE the ladder shipped: narrow id, none of the three columns. */
const CREATE_TASKS_PRE_LADDER = `
  CREATE TABLE IF NOT EXISTS public.student_tasks (
    id          UUID PRIMARY KEY,
    title       CHARACTER VARYING(500) NOT NULL,
    story_id    CHARACTER VARYING(60),
    release_key CHARACTER VARYING(60)
  )`;

/**
 * A stand-in for `snap_quincy_20260819`: same table name, the OLD narrow id, and all three ladder
 * columns present. Both halves matter. The narrow id is what made the assert cry wolf; having the
 * three columns is what would let a snapshot MASK a `public` that is genuinely missing one.
 */
const SNAPSHOT_SCHEMA = 'snap_ladder_probe';

/** The query as it was written when it misreported production. Retyped, because it no longer exists. */
const PRE_FIX_QUERY = `SELECT column_name, character_maximum_length FROM information_schema.columns
    WHERE table_name = 'student_tasks'
      AND column_name = ANY($names)`;

describeIfDb('the ladder schema assert, with a second schema present', () => {
  let sequelize: import('sequelize').Sequelize;
  let ensureSchema: typeof import('../ensureAgentDomainStoryLadderSchema')
    .ensureAgentDomainStoryLadderSchema;
  let assertSchema: typeof import('../ensureAgentDomainStoryLadderSchema')
    .assertAgentDomainStoryLadderSchema;
  let REQUIRED_COLUMNS: typeof import('../ensureAgentDomainStoryLadderSchema').REQUIRED_COLUMNS;
  let STORY_ID_MIN_WIDTH: typeof import('../ensureAgentDomainStoryLadderSchema').STORY_ID_MIN_WIDTH;

  /** Columns of ONE schema's `student_tasks`, keyed by name. */
  async function widthsIn(schema: string): Promise<Map<string, number | null>> {
    const rows = await sequelize.query<{
      column_name: string; character_maximum_length: number | null;
    }>(
      `SELECT column_name, character_maximum_length FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'student_tasks'`,
      { bind: [schema], type: QueryTypes.SELECT },
    );
    return new Map(rows.map((r) => [r.column_name, r.character_maximum_length]));
  }

  beforeAll(async () => {
    // Lazily imported so the module's top-level `new Sequelize(...)` never runs in CI without a
    // database, matching `agentDomainProvisioner.concurrency.integration.test.ts`.
    ({ sequelize } = await import('../../config/database'));
    ({
      ensureAgentDomainStoryLadderSchema: ensureSchema,
      assertAgentDomainStoryLadderSchema: assertSchema,
      REQUIRED_COLUMNS,
      STORY_ID_MIN_WIDTH,
    } = await import('../ensureAgentDomainStoryLadderSchema'));

    await sequelize.query(`DROP SCHEMA IF EXISTS ${SNAPSHOT_SCHEMA} CASCADE`);
    await sequelize.query('DROP TABLE IF EXISTS public.student_tasks');
    await sequelize.query(CREATE_TASKS_PRE_LADDER);
  });

  afterAll(async () => {
    if (!sequelize) return;
    await sequelize.query(`DROP SCHEMA IF EXISTS ${SNAPSHOT_SCHEMA} CASCADE`);
    await sequelize.close();
  });

  it('FIXTURE: starts in the real pre-ladder shape, or nothing below means anything', async () => {
    const cols = await widthsIn('public');
    expect(cols.get('story_id')).toBe(60);
    for (const c of REQUIRED_COLUMNS) expect(cols.has(c)).toBe(false);
  });

  it('the four real statements land against a real server', async () => {
    await ensureSchema();

    const cols = await widthsIn('public');
    for (const c of REQUIRED_COLUMNS) expect(cols.has(c)).toBe(true);
    // The widening is the one that silently failed to be SEEN in production.
    expect(cols.get('story_id')).toBe(STORY_ID_MIN_WIDTH);
    await expect(assertSchema()).resolves.toBe(true);
  });

  describe('once a second schema holds a table of the same name', () => {
    beforeAll(async () => {
      await sequelize.query(`CREATE SCHEMA ${SNAPSHOT_SCHEMA}`);
      // Deliberately the OLD narrow width, which is correct for a frozen backup.
      await sequelize.query(`CREATE TABLE ${SNAPSHOT_SCHEMA}.student_tasks (
        id             UUID PRIMARY KEY,
        story_id       CHARACTER VARYING(60),
        capability_id  TEXT,
        autonomy_stage TEXT,
        story_kind     TEXT
      )`);
    });

    it('FIXTURE: the second schema really is narrower than public', async () => {
      // Asserted before the test that depends on it. If these two widths ever match, the test
      // below passes while the condition it exists for is absent.
      expect(await widthsIn(SNAPSHOT_SCHEMA).then((c) => c.get('story_id'))).toBe(60);
      expect(await widthsIn('public').then((c) => c.get('story_id')))
        .toBe(STORY_ID_MIN_WIDTH);
    });

    it('THE DEFECT, FIXED: the assert still passes and ignores the snapshot', async () => {
      await expect(assertSchema()).resolves.toBe(true);
    });

    it('NEGATIVE CONTROL: the pre-fix query shape comes back AMBIGUOUS on this same database',
      async () => {
        // This is the whole defect, and it is not that the query read the wrong row -- row order
        // here is unspecified, so the verdict was arbitrary. An arbitrary post-condition is the
        // bug. In production it resolved to a snapshot and reported a violation that was not real.
        const rows = await sequelize.query<{
          column_name: string; character_maximum_length: number | null;
        }>(PRE_FIX_QUERY, {
          bind: { names: [...REQUIRED_COLUMNS, 'story_id'] },
          type: QueryTypes.SELECT,
        });

        const storyIdWidths = rows
          .filter((r) => r.column_name === 'story_id')
          .map((r) => r.character_maximum_length);

        expect(storyIdWidths).toHaveLength(2);
        expect(new Set(storyIdWidths)).toEqual(new Set([60, STORY_ID_MIN_WIDTH]));
        // And the narrow one is present, which is the value that produced the false alarm.
        expect(storyIdWidths).toContain(60);
      });
  });

  describe('the filter has not simply disabled the check', () => {
    it('CONTROL: still FAILS when public itself is too narrow', async () => {
      await sequelize.query(
        'ALTER TABLE public.student_tasks ALTER COLUMN story_id TYPE CHARACTER VARYING(60)',
      );
      try {
        await expect(assertSchema()).resolves.toBe(false);
      } finally {
        await sequelize.query(
          `ALTER TABLE public.student_tasks ALTER COLUMN story_id TYPE `
          + `CHARACTER VARYING(${STORY_ID_MIN_WIDTH})`,
        );
      }
      await expect(assertSchema()).resolves.toBe(true);
    });

    it('CONTROL, THE SILENT DIRECTION: still FAILS when only the snapshot has the column',
      async () => {
        // The dangerous half. Pre-fix, a column missing from `public` could be reported as
        // present because a backup schema still had it -- a post-condition announcing success
        // over the exact failure it exists to catch. The snapshot keeps all three columns, so
        // this passes only if the assert is genuinely looking at `public` alone.
        await sequelize.query('ALTER TABLE public.student_tasks DROP COLUMN capability_id');
        try {
          await expect(assertSchema()).resolves.toBe(false);
          const snapshot = await widthsIn(SNAPSHOT_SCHEMA);
          expect(snapshot.has('capability_id')).toBe(true);
        } finally {
          await sequelize.query('ALTER TABLE public.student_tasks ADD COLUMN capability_id TEXT');
        }
        await expect(assertSchema()).resolves.toBe(true);
      });
  });
});
