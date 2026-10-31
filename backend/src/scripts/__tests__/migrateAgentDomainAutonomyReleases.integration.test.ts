/**
 * The four migration statements, executed against a REAL Postgres.
 *
 * This tier exists because of what Phase 1 cost. The Command Center backfill shipped two
 * statements that shared one bind placeholder between `title` (varchar(500)) and `description`
 * (text). Postgres deduces a parameter's type from each use site, refused at parse, and failed all
 * ten domains in production -- while three gates stayed green, each for a legitimate reason:
 *
 *   - the unit tier mocks `sequelize.query`, and a mock records a string and never deduces a type;
 *   - the pure planner was fully covered, and the bug was not in the plan;
 *   - **the dry run printed every domain as fine, because a dry run never executes the write.**
 *
 * So the statements are imported from the script and executed verbatim. A retyped copy in a test
 * drifts, and a drifted copy goes green while the real statement is broken.
 *
 * Each statement also gets a NEGATIVE CONTROL that runs the pre-fix form and requires it to fail.
 * Without one, a test proving "the statement works" cannot tell you whether it is testing anything.
 *
 * Run it with a database:
 *   docker run -d --name pg-ladder -p 55441:5432 -e POSTGRES_PASSWORD=pw postgres:16-alpine
 *   DATABASE_URL=postgres://postgres:pw@localhost:55441/postgres npx jest migrateAgentDomainAutonomy
 */
import { Sequelize, QueryTypes } from 'sequelize';
import {
  LIST_INSERT_SQL,
  LIST_RETITLE_SQL,
  STORY_REPARENT_SQL,
  STORY_INSERT_SQL,
} from '../migrateAgentDomainAutonomyReleases';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // Loud, because a silently skipped suite is how the Phase 1 defect would have survived a second
  // time. A skip here means this file proved nothing.
  console.warn(
    '[migrateAgentDomainAutonomyReleases.integration] SKIPPED: no DATABASE_URL. '
    + 'These are the only tests that can catch a bind-placeholder type error, because a mocked '
    + 'query never deduces a parameter type. CI runs them in the integration tier.',
  );
}

/**
 * The column types are copied from production `information_schema`, read 2026-10-31, with
 * `story_id` at its WIDENED width.
 *
 * `title` being `varchar(500)` while `description` is `text` is the whole point: widen `title` to
 * `text` here and this suite silently stops being able to detect the defect it exists for. A test
 * below asserts the types before anything depends on them.
 */
const CREATE_LISTS = `
  CREATE TABLE IF NOT EXISTS student_task_lists (
    id            UUID PRIMARY KEY,
    project_id    UUID NOT NULL,
    enrollment_id UUID,
    cluster       CHARACTER VARYING(50) NOT NULL,
    title         CHARACTER VARYING(255) NOT NULL,
    status        CHARACTER VARYING(30) NOT NULL DEFAULT 'not_started',
    position      INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT student_task_lists_unique_cluster UNIQUE (project_id, cluster)
  )`;

const CREATE_TASKS = `
  CREATE TABLE IF NOT EXISTS student_tasks (
    id             UUID PRIMARY KEY,
    task_list_id   UUID NOT NULL,
    project_id     UUID NOT NULL,
    title          CHARACTER VARYING(500) NOT NULL,
    description    TEXT,
    narrative      TEXT,
    build          TEXT,
    acceptance     JSONB,
    status         CHARACTER VARYING(30) NOT NULL DEFAULT 'not_started',
    position       INTEGER NOT NULL DEFAULT 0,
    story_id       CHARACTER VARYING(120),
    release_key    CHARACTER VARYING(60),
    capability_id  TEXT,
    autonomy_stage TEXT,
    story_kind     TEXT,
    verified_at    TIMESTAMPTZ,
    verified_by    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

const PROJECT = '11111111-1111-4111-8111-111111111111';
const ENROLLMENT = '22222222-2222-4222-8222-222222222222';
const uuid = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;

describeIfDb('the migration statements against a real server', () => {
  let sequelize: Sequelize;

  const sel = <T>(sql: string, bind?: unknown[]) =>
    sequelize.query(sql, { bind, type: QueryTypes.SELECT }) as unknown as Promise<T[]>;

  beforeAll(async () => {
    sequelize = new Sequelize(process.env.DATABASE_URL as string, { logging: false });
    await sequelize.authenticate();
    await sequelize.query('DROP TABLE IF EXISTS student_tasks');
    await sequelize.query('DROP TABLE IF EXISTS student_task_lists');
    await sequelize.query(CREATE_LISTS);
    await sequelize.query(CREATE_TASKS);
  });

  afterAll(async () => {
    if (sequelize) await sequelize.close();
  });

  beforeEach(async () => {
    await sequelize.query('TRUNCATE student_tasks');
    await sequelize.query('TRUNCATE student_task_lists');
  });

  it('the fixture really has the two DIFFERENT types the defect needs', async () => {
    // Asserted FIRST, because every negative control below depends on it. If `title` and
    // `description` ever end up the same type here, the controls pass while proving nothing.
    const cols = await sel<{ column_name: string; data_type: string; character_maximum_length: number | null }>(
      `SELECT column_name, data_type, character_maximum_length FROM information_schema.columns
        WHERE table_name = 'student_tasks'
          AND column_name IN ('title', 'description', 'story_id')`,
    );
    const by = new Map(cols.map((c) => [c.column_name, c]));
    expect(by.get('title')?.data_type).toBe('character varying');
    expect(by.get('title')?.character_maximum_length).toBe(500);
    expect(by.get('description')?.data_type).toBe('text');
    // The widening Phase 2 depends on. At 60 the per-rung ids truncate and collide.
    expect(by.get('story_id')?.character_maximum_length).toBe(120);
  });

  describe('LIST_INSERT_SQL', () => {
    it('creates a rung release', async () => {
      await sequelize.query(LIST_INSERT_SQL, {
        bind: [uuid(1), PROJECT, ENROLLMENT, 'autonomy:R0', 'R0 · Define the workflow', 0],
      });
      const rows = await sel<{ cluster: string; title: string; position: number; status: string }>(
        'SELECT cluster, title, position, status FROM student_task_lists WHERE id = $1', [uuid(1)],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].cluster).toBe('autonomy:R0');
      expect(rows[0].status).toBe('not_started');
    });

    it('is idempotent on a second run, and does not raise', async () => {
      const bind = [uuid(1), PROJECT, ENROLLMENT, 'autonomy:R0', 'R0 · Define the workflow', 0];
      await sequelize.query(LIST_INSERT_SQL, { bind });
      await sequelize.query(LIST_INSERT_SQL, { bind });
      const n = await sel<{ n: string }>('SELECT count(*)::text AS n FROM student_task_lists');
      expect(n[0].n).toBe('1');
    });

    it('a rung and the kept legacy release coexist, which the unique index allows', async () => {
      // `(project_id, cluster)` is UNIQUE, so this is the assertion that `r0` and `autonomy:R0`
      // being DIFFERENT STRINGS is what makes keeping the originals possible at all.
      await sequelize.query(LIST_INSERT_SQL, {
        bind: [uuid(1), PROJECT, ENROLLMENT, 'autonomy:R0', 'R0 · Define the workflow', 0],
      });
      await sequelize.query(LIST_INSERT_SQL, {
        bind: [uuid(2), PROJECT, ENROLLMENT, 'r0', 'Discovery and validation (superseded)', 10],
      });
      const n = await sel<{ n: string }>('SELECT count(*)::text AS n FROM student_task_lists');
      expect(n[0].n).toBe('2');
    });

    it('NEGATIVE CONTROL: a second list sharing one cluster is refused by the index', async () => {
      await sequelize.query(LIST_INSERT_SQL, {
        bind: [uuid(1), PROJECT, ENROLLMENT, 'autonomy:R0', 'first', 0],
      });
      // A DIFFERENT id, so `ON CONFLICT (id)` does not absorb it. This is the collision surface
      // the plan has to avoid, and it proves the index is actually here rather than assumed.
      //
      // Matched on the error CLASS, not the message: Sequelize rewrites a unique violation into
      // its own `SequelizeUniqueConstraintError` whose message is the bare string "Validation
      // error", so a regex over the message finds neither the constraint name nor "duplicate key".
      expect.assertions(2);
      try {
        await sequelize.query(LIST_INSERT_SQL, {
          bind: [uuid(2), PROJECT, ENROLLMENT, 'autonomy:R0', 'second', 1],
        });
      } catch (err: any) {
        expect(err.name).toBe('SequelizeUniqueConstraintError');
        expect(err.parent?.constraint).toBe('student_task_lists_unique_cluster');
      }
    });
  });

  describe('LIST_RETITLE_SQL', () => {
    beforeEach(async () => {
      await sequelize.query(LIST_INSERT_SQL, {
        bind: [uuid(1), PROJECT, ENROLLMENT, 'r0', 'Discovery and validation', 0],
      });
    });

    it('moves a kept release below the ladder and marks it superseded', async () => {
      await sequelize.query(LIST_RETITLE_SQL, {
        bind: [uuid(1), 'Discovery and validation (superseded by the ladder)', 10],
      });
      const rows = await sel<{ title: string; position: number; status: string }>(
        'SELECT title, position, status FROM student_task_lists WHERE id = $1', [uuid(1)],
      );
      expect(rows[0].title).toMatch(/superseded/);
      expect(rows[0].position).toBe(10);
      // An empty release is not a completed one.
      expect(rows[0].status).toBe('not_started');
    });

    it('writes nothing the second time, measured on the row version', async () => {
      const bind = [uuid(1), 'Discovery and validation (superseded by the ladder)', 10];
      await sequelize.query(LIST_RETITLE_SQL, { bind });
      const first = await sel<{ v: string }>(
        'SELECT xmin::text AS v FROM student_task_lists WHERE id = $1', [uuid(1)],
      );
      await sequelize.query(LIST_RETITLE_SQL, { bind });
      const second = await sel<{ v: string }>(
        'SELECT xmin::text AS v FROM student_task_lists WHERE id = $1', [uuid(1)],
      );
      // `xmin` is the transaction that last wrote this physical row, so this detects a rewrite
      // even when it writes identical values. `updated_at` was the obvious thing to compare and
      // is the wrong one: `String(Date)` renders to whole seconds, so two writes inside the same
      // second compare equal and the test passes while the guard does nothing.
      expect(second[0].v).toBe(first[0].v);
    });
  });

  describe('STORY_REPARENT_SQL', () => {
    const FULL_STORY_ID = 'platform.CAP.orchestration_health_watch';
    /** id, task_list_id, release_key, autonomy_stage, capability_id, story_kind, position, story_id */
    const reparentBind = (
      capabilityId = 'platform.orchestration_health_watch', position = 3, storyId = FULL_STORY_ID,
    ) => [uuid(10), uuid(2), 'autonomy:R0', 'autonomy:R0', capabilityId, 'implementation',
      position, storyId];

    /**
     * The same statement with `capability_id` fed from `release_key`'s placeholder, with the whole
     * parameter tail renumbered so the bind COUNT still matches. Without the renumbering the
     * server rejects it for supplying 7 binds to an 8-parameter statement, which is a different
     * error and would prove the wrong thing.
     */
    const sharedPlaceholderVariant = (keepGuard: boolean): string => {
      const brokenSet = STORY_REPARENT_SQL.replace(
        'capability_id = $5,\n          story_kind = $6, position = $7, story_id = $8',
        'capability_id = $3,\n          story_kind = $5, position = $6, story_id = $7',
      );
      if (!keepGuard) return brokenSet.replace(/\s+AND \(task_list_id IS DISTINCT[\s\S]*$/, '');
      return brokenSet
        .replace('OR capability_id IS DISTINCT FROM $5', 'OR capability_id IS DISTINCT FROM $3')
        .replace('OR story_kind IS DISTINCT FROM $6', 'OR story_kind IS DISTINCT FROM $5')
        .replace('OR position IS DISTINCT FROM $7', 'OR position IS DISTINCT FROM $6')
        .replace('OR story_id IS DISTINCT FROM $8)', 'OR story_id IS DISTINCT FROM $7)');
    };

    /** The 7 binds the renumbered variant takes. */
    const brokenBind = () => [uuid(10), uuid(2), 'autonomy:R0', 'autonomy:R0', 'implementation',
      3, FULL_STORY_ID];

    beforeEach(async () => {
      await sequelize.query(LIST_INSERT_SQL, {
        bind: [uuid(1), PROJECT, ENROLLMENT, 'r2', 'Capability development', 2],
      });
      await sequelize.query(LIST_INSERT_SQL, {
        bind: [uuid(2), PROJECT, ENROLLMENT, 'autonomy:R0', 'R0 · Define the workflow', 0],
      });
      await sequelize.query(
        `INSERT INTO student_tasks
           (id, task_list_id, project_id, title, description, narrative, build, status, position,
            story_id, release_key, verified_at, verified_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'in_progress', 7, $8, 'r2', now(), 'a real human')`,
        {
          bind: [uuid(10), uuid(1), PROJECT, 'Orchestration health watch', 'desc', 'narr', 'build',
            'platform.CAP.orchestration_health_watch'],
        },
      );
    });

    it('moves the row onto the rung and labels it, keeping status and verification', async () => {
      await sequelize.query(STORY_REPARENT_SQL, { bind: reparentBind() });
      const rows = await sel<Record<string, unknown>>(
        `SELECT task_list_id, release_key, autonomy_stage, capability_id, story_kind, position,
                status, title, narrative, build, verified_at, verified_by
           FROM student_tasks WHERE id = $1`, [uuid(10)],
      );
      expect(rows[0].task_list_id).toBe(uuid(2));
      expect(rows[0].release_key).toBe('autonomy:R0');
      expect(rows[0].autonomy_stage).toBe('autonomy:R0');
      expect(rows[0].story_kind).toBe('implementation');
      expect(rows[0].position).toBe(3);
      // THE POINT OF THE WHOLE MIGRATION: real work is not disturbed.
      expect(rows[0].status).toBe('in_progress');
      expect(rows[0].title).toBe('Orchestration health watch');
      expect(rows[0].narrative).toBe('narr');
      expect(rows[0].build).toBe('build');
      expect(rows[0].verified_by).toBe('a real human');
      expect(rows[0].verified_at).not.toBeNull();
    });

    it('is value-idempotent: the second run does not touch the row', async () => {
      const bind = reparentBind();
      await sequelize.query(STORY_REPARENT_SQL, { bind });
      const once = await sel<Record<string, unknown>>(
        'SELECT * FROM student_tasks WHERE id = $1', [uuid(10)],
      );
      await sequelize.query(STORY_REPARENT_SQL, { bind });
      const twice = await sel<Record<string, unknown>>(
        'SELECT * FROM student_tasks WHERE id = $1', [uuid(10)],
      );
      // Whole-row equality, `updated_at` included. This is the branch a SECOND run takes, and in
      // Phase 1 it was the branch that could not execute at all while run one looked fine.
      expect(twice).toEqual(once);
    });

    /**
     * The pair below is the most useful thing in this file, and neither half was what I expected.
     *
     * Phase 1's defect was caught by the SERVER: one placeholder serving `title` (varchar) and
     * `description` (text) in an `INSERT ... VALUES` is a contradiction, refused at parse with
     * "inconsistent types deduced for parameter $4". So the obvious assumption is that the same
     * mistake in this UPDATE would also be refused.
     *
     * Measured against a real Postgres 16, it depends on something nobody would think to check:
     *
     *   UPDATE t SET vc = $2, tx = $2 WHERE id = $1                      -> REFUSED
     *   UPDATE t SET vc = $2, tx = $2 WHERE id = $1 AND vc IS DISTINCT FROM $2  -> ACCEPTED
     *
     * **The `IS DISTINCT FROM` guard is what suppresses the error.** Comparing the parameter
     * against a `varchar` column pins its type, the contradiction resolves, and the statement
     * runs -- writing the release key into the capability column and reporting success.
     *
     * That guard is on every parameter of `STORY_REPARENT_SQL`, deliberately, because it is what
     * makes the statement idempotent. So the idempotency guard and the server's type check are in
     * direct tension: this statement gained replay safety and lost the one gate that caught the
     * same defect a fortnight ago. There is no way to have both, which is exactly why the test
     * immediately after this one checks each column by VALUE rather than trusting the server.
     */
    it('the guard that makes this idempotent also blinds the server to a shared placeholder', async () => {
      const brokenAndGuarded = sharedPlaceholderVariant(true);
      expect(brokenAndGuarded).toContain('capability_id = $3');
      expect(brokenAndGuarded).toContain('IS DISTINCT FROM');
      expect(brokenAndGuarded).not.toContain('$8');

      // ACCEPTED. No error, and the wrong value lands in the wrong column.
      await sequelize.query(brokenAndGuarded, { bind: brokenBind() });
      const rows = await sel<{ capability_id: string; release_key: string }>(
        'SELECT capability_id, release_key FROM student_tasks WHERE id = $1', [uuid(10)],
      );
      expect(rows[0].capability_id).toBe('autonomy:R0');
      expect(rows[0].release_key).toBe('autonomy:R0');
    });

    it('CONTROL: strip the guard and the server refuses the same mistake', async () => {
      // The other half. Proves the acceptance above is caused by the guard rather than by UPDATE
      // being generally permissive -- without it, this is the identical Phase 1 failure.
      const brokenAndUnguarded = sharedPlaceholderVariant(false);
      expect(brokenAndUnguarded).not.toContain('IS DISTINCT FROM');
      expect(brokenAndUnguarded).toContain('capability_id = $3');

      await expect(sequelize.query(brokenAndUnguarded, { bind: brokenBind() }))
        .rejects.toThrow(/inconsistent types deduced for parameter \$3/);
    });

    it('repairs a story_id that was truncated by the old varchar(60) column', async () => {
      // 17 production rows are stored cut off mid-word, because `story_id` was varchar(60) when
      // they were written while the row `id` was derived from the FULL string. Re-parenting is
      // where that gets repaired, and the repair is only possible now the column is 120.
      const truncated = 'product_experience.CAP.stylesheet_architecture_consolidation';
      const full = 'product_experience.CAP.stylesheet_architecture_consolidation_proposal';
      expect(truncated).toHaveLength(60);
      expect(full.length).toBeGreaterThan(60);

      await sequelize.query('UPDATE student_tasks SET story_id = $1 WHERE id = $2',
        { bind: [truncated, uuid(10)] });
      await sequelize.query(STORY_REPARENT_SQL, { bind: reparentBind('cap', 3, full) });

      const rows = await sel<{ story_id: string; status: string; verified_by: string }>(
        'SELECT story_id, status, verified_by FROM student_tasks WHERE id = $1', [uuid(10)],
      );
      expect(rows[0].story_id).toBe(full);
      // The repair does not disturb the work on the row.
      expect(rows[0].status).toBe('in_progress');
      expect(rows[0].verified_by).toBe('a real human');
    });

    it('the SHIPPED statement puts each value in its own column', async () => {
      // The positive half of the pair above. This is the assertion that would have caught the
      // silent version of the defect, since the server will not.
      await sequelize.query(STORY_REPARENT_SQL, { bind: reparentBind() });
      const rows = await sel<{ capability_id: string; release_key: string; story_kind: string }>(
        'SELECT capability_id, release_key, story_kind FROM student_tasks WHERE id = $1', [uuid(10)],
      );
      expect(rows[0].capability_id).toBe('platform.orchestration_health_watch');
      expect(rows[0].release_key).toBe('autonomy:R0');
      expect(rows[0].story_kind).toBe('implementation');
    });

    it('NEGATIVE CONTROL: without the guard, a no-op run WOULD rewrite the row', async () => {
      // Proves the idempotency above comes from the `IS DISTINCT FROM` clause and not from
      // Postgres declining to write identical values. Strip the guard and the row is physically
      // rewritten, which `xmin` shows and a whole-second timestamp comparison would miss.
      const unguarded = STORY_REPARENT_SQL.replace(/\s+AND \(task_list_id IS DISTINCT[\s\S]*$/, '');
      expect(unguarded).not.toContain('IS DISTINCT FROM');
      const bind = reparentBind();
      await sequelize.query(STORY_REPARENT_SQL, { bind });
      const before = await sel<{ v: string }>(
        'SELECT xmin::text AS v FROM student_tasks WHERE id = $1', [uuid(10)],
      );
      await sequelize.query(unguarded, { bind });
      const after = await sel<{ v: string }>(
        'SELECT xmin::text AS v FROM student_tasks WHERE id = $1', [uuid(10)],
      );
      expect(after[0].v).not.toBe(before[0].v);

      // And the guarded form, run against the same already-correct state, does not.
      const guardedBefore = after[0].v;
      await sequelize.query(STORY_REPARENT_SQL, { bind });
      const guardedAfter = await sel<{ v: string }>(
        'SELECT xmin::text AS v FROM student_tasks WHERE id = $1', [uuid(10)],
      );
      expect(guardedAfter[0].v).toBe(guardedBefore);
    });
  });

  describe('STORY_INSERT_SQL', () => {
    beforeEach(async () => {
      await sequelize.query(LIST_INSERT_SQL, {
        bind: [uuid(2), PROJECT, ENROLLMENT, 'autonomy:R4', 'R4 · Execute and verify', 4],
      });
    });

    const longStoryId =
      'product_experience.CAP.stylesheet_architecture_consolidation_proposal.autonomy:R4';

    it('writes a per-rung story with its acceptance criteria', async () => {
      await sequelize.query(STORY_INSERT_SQL, {
        bind: [uuid(20), uuid(2), PROJECT, 'Stylesheet consolidation · R4', 'Stylesheet consolidation · R4',
          'narr', 'build', 0, longStoryId, 'autonomy:R4',
          'product_experience.stylesheet_architecture_consolidation_proposal', 'autonomy:R4',
          'release_behaviour', JSON.stringify(['A seeded fixture walks the lifecycle end to end'])],
      });
      const rows = await sel<Record<string, unknown>>(
        `SELECT story_id, release_key, autonomy_stage, story_kind, capability_id, acceptance, status
           FROM student_tasks WHERE id = $1`, [uuid(20)],
      );
      expect(rows[0].story_id).toBe(longStoryId);
      expect(rows[0].autonomy_stage).toBe('autonomy:R4');
      expect(rows[0].story_kind).toBe('release_behaviour');
      expect(rows[0].acceptance).toEqual(['A seeded fixture walks the lifecycle end to end']);
      expect(rows[0].status).toBe('not_started');
    });

    it('the 81-character id survives the widened column WITHOUT truncation', async () => {
      // The measurement that forced the widening: this id is 81 characters, and at varchar(60) it
      // would have been stored as its first 60 -- identical to the same capability's R0, R1 and R2
      // stories, which is two distinct rows carrying one `story_id` and no error to show for it.
      expect(longStoryId.length).toBeGreaterThan(60);
      await sequelize.query(STORY_INSERT_SQL, {
        bind: [uuid(20), uuid(2), PROJECT, 't', 't', 'n', 'b', 0, longStoryId, 'autonomy:R4',
          'cap', 'autonomy:R4', 'release_behaviour', null],
      });
      const rows = await sel<{ story_id: string }>(
        'SELECT story_id FROM student_tasks WHERE id = $1', [uuid(20)],
      );
      expect(rows[0].story_id).toBe(longStoryId);
      expect(rows[0].story_id).toHaveLength(longStoryId.length);
    });

    it('NEGATIVE CONTROL: at the OLD width the same id is rejected or cut', async () => {
      // Proves the test above measures the widening rather than passing for free. A varchar(60)
      // column refuses this value outright, which is the LOUD version of the failure; the silent
      // version was the application slicing it before the insert.
      await sequelize.query('ALTER TABLE student_tasks ADD COLUMN narrow_story_id VARCHAR(60)');
      try {
        await expect(sequelize.query(
          'UPDATE student_tasks SET narrow_story_id = $1', { bind: [longStoryId] },
        )).rejects.toThrow(/too long for type character varying\(60\)/);
      } finally {
        await sequelize.query('ALTER TABLE student_tasks DROP COLUMN narrow_story_id');
      }
    });

    it('NEGATIVE CONTROL: sharing one placeholder across title and description is refused', async () => {
      // Phase 1's exact defect, reproduced on this statement. The whole parameter tail shifts so
      // the bind COUNT still matches -- otherwise the server rejects it for supplying 13 binds to
      // a 14-parameter statement, which is a different error proving the wrong thing.
      const broken = STORY_INSERT_SQL
        .replace('$4, $5, $6, $7, \'not_started\', $8, $9, $10, $11, $12, $13, $14::jsonb',
          '$4, $4, $5, $6, \'not_started\', $7, $8, $9, $10, $11, $12, $13::jsonb');
      expect(broken).not.toBe(STORY_INSERT_SQL);
      expect(broken).toContain('$4, $4');
      expect(broken).not.toContain('$14');
      await expect(sequelize.query(broken, {
        bind: [uuid(20), uuid(2), PROJECT, 'title', 'narr', 'build', 0, longStoryId,
          'autonomy:R4', 'cap', 'autonomy:R4', 'release_behaviour', null],
      })).rejects.toThrow(/inconsistent types deduced for parameter \$4/);
    });

    it('cannot duplicate a story on a re-run', async () => {
      const bind = [uuid(20), uuid(2), PROJECT, 't', 't', 'n', 'b', 0, longStoryId,
        'autonomy:R4', 'cap', 'autonomy:R4', 'release_behaviour', null];
      await sequelize.query(STORY_INSERT_SQL, { bind });
      await sequelize.query(STORY_INSERT_SQL, { bind });
      const n = await sel<{ n: string }>('SELECT count(*)::text AS n FROM student_tasks');
      expect(n[0].n).toBe('1');
    });
  });
});
