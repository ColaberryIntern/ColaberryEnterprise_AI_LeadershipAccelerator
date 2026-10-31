/**
 * The two Command Center statements EXECUTE against real Postgres.
 *
 * ## Why this suite exists
 *
 * The first `--apply` run of `backfillAgentDomainCommandCenter` in production, 31 October 2026,
 * refused all ten domains:
 *
 *     learner_success  failed  DatabaseError: inconsistent types deduced for parameter $4
 *     ... x10, created 0, failed 10
 *
 * Postgres deduces a parameter's type from each place it is used. The INSERT had written
 * `VALUES (..., $4, $4, ...)` into `title` and `description`, which are `character varying(500)`
 * and `text`. One parameter cannot be both. The refresh `UPDATE` had the same defect.
 *
 * Every pre-existing test went green through all of it, and each for a legitimate reason:
 *
 * - the unit tier mocks `sequelize.query`, and a mock never deduces a type
 * - `intendedOrder` is pure and fully covered - the bug was not in the decision
 * - the DRY RUN printed all ten as `created`, because it computes the plan and never writes
 *
 * ONLY A REAL SERVER ANSWERS THIS. That is the whole argument for this file. The statements are
 * imported, never retyped, so this executes what the script executes rather than a copy that can
 * drift.
 *
 * ## The controls
 *
 * Each statement has a NEGATIVE CONTROL that runs the pre-fix form and requires it to fail with
 * the production error text. Without them, two passing writes would prove the statements work
 * today and prove nothing about whether this suite can detect the defect returning.
 *
 * ## Why the table is built by hand here
 *
 * `student_tasks` has no DDL anywhere in this repo - noted independently in
 * `resolveProjectForNewBuildRace.integration.test.ts`. So the column types below are taken from
 * PRODUCTION `information_schema.columns`, read on 31 October 2026, and the two that matter are
 * reproduced exactly: `title character varying(500)`, `description text`. Widen `title` to `text`
 * and this suite goes green with the defect in place, which is the one way to make it worthless.
 *
 * No foreign keys and no parent tables: what is under test is parameter type deduction, not
 * referential integrity, and every unneeded table is another way for the bootstrap to fail for a
 * reason that has nothing to do with the question.
 *
 * ── Running it ────────────────────────────────────────────────────────────────────────
 *
 *   docker run --rm -d --name cc-stmt-pg -p 55440:5432 \
 *     -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=cc_stmt_test \
 *     postgres:16-alpine
 *
 *   # from backend/:
 *   DATABASE_URL=postgres://test:test@127.0.0.1:55440/cc_stmt_test \
 *     npx jest -c jest.config.ts src/scripts/__tests__/commandCenterStatements.integration
 *
 *   docker rm -f cc-stmt-pg
 *
 * In CI, `scripts/ci/runIntegrationSuites.js` discovers this file by its name and gives it its own
 * database. With no `DATABASE_URL` it SKIPS AND SAYS SO.
 */
import { QueryTypes } from 'sequelize';

import {
  COMMAND_CENTER_INSERT_SQL,
  COMMAND_CENTER_REFRESH_SQL,
} from '../backfillAgentDomainCommandCenter';

jest.setTimeout(120_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[commandCenterStatements] SKIPPED: no DATABASE_URL. This suite needs a real Postgres - the '
    + 'docblock has the docker run and the exact command. A skip is NOT evidence that the '
    + 'statements execute; that is precisely the gap that let "inconsistent types deduced for '
    + 'parameter $4" reach production.',
  );
}

/** Production column types, read from information_schema on 31 October 2026. */
const CREATE_STUDENT_TASKS = `
  CREATE TABLE IF NOT EXISTS student_tasks (
    id            UUID PRIMARY KEY,
    task_list_id  UUID NOT NULL,
    project_id    UUID NOT NULL,
    title         CHARACTER VARYING(500) NOT NULL,
    description   TEXT,
    narrative     TEXT,
    build         TEXT,
    acceptance    JSONB,
    status        CHARACTER VARYING(30) NOT NULL DEFAULT 'not_started',
    position      INTEGER NOT NULL DEFAULT 0,
    story_id      CHARACTER VARYING(60),
    release_key   CHARACTER VARYING(60),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

const ROW_ID = '11111111-1111-4111-8111-111111111111';
const LIST_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const STORY_ID = 'marketing.STORY-000';

const TITLE = 'STORY-000 - Build your Command Center';
const BODY = 'The window onto the system you are about to build.';
const PROMPT = 'Six panels, each naming the endpoint behind it.';
const ACCEPTANCE = JSON.stringify(['Given the board, the Command Center renders first.']);

interface TaskRow {
  title: string;
  description: string | null;
  narrative: string | null;
  build: string | null;
  acceptance: string[] | null;
  status: string;
  position: number;
}

describeIfDb('the Command Center statements execute against real Postgres', () => {
  let sequelize: import('sequelize').Sequelize;

  const readRow = async (): Promise<TaskRow> => {
    const rows = await sequelize.query<TaskRow>(
      `SELECT title, description, narrative, build, acceptance, status, position
         FROM student_tasks WHERE id = $1`,
      { bind: [ROW_ID], type: QueryTypes.SELECT },
    );
    expect(rows).toHaveLength(1);
    return rows[0];
  };

  const runInsert = (sql: string) => sequelize.query(sql, {
    bind: [ROW_ID, LIST_ID, PROJECT_ID, TITLE, TITLE, BODY, PROMPT, ACCEPTANCE, 5, STORY_ID, 'r0'],
    type: QueryTypes.INSERT,
  });

  beforeAll(async () => {
    ({ sequelize } = await import('../../config/database'));
    await sequelize.query(CREATE_STUDENT_TASKS);
    await sequelize.query('DELETE FROM student_tasks WHERE id = $1', { bind: [ROW_ID] });
  });

  afterAll(async () => {
    await sequelize.query('DELETE FROM student_tasks WHERE id = $1', { bind: [ROW_ID] });
    await sequelize.close();
  });

  it('the column types that caused the failure are the ones this suite is running against', async () => {
    // Asserted, not assumed. If a future edit widens `title` to text, this suite would silently
    // stop being able to detect the defect, so the premise is checked before anything depends on it.
    const cols = await sequelize.query<{ column_name: string; data_type: string; len: number | null }>(
      `SELECT column_name, data_type, character_maximum_length AS len
         FROM information_schema.columns
        WHERE table_name = 'student_tasks' AND column_name IN ('title', 'description')`,
      { type: QueryTypes.SELECT },
    );
    const byName = new Map(cols.map((c) => [c.column_name, c]));

    expect(byName.get('title')).toMatchObject({ data_type: 'character varying', len: 500 });
    expect(byName.get('description')).toMatchObject({ data_type: 'text' });
  });

  it('INSERTs the Command Center row, writing description from its own placeholder', async () => {
    await runInsert(COMMAND_CENTER_INSERT_SQL);
    const row = await readRow();

    expect(row.title).toBe(TITLE);
    // Duplicating the VALUE is the intent; what the defect got wrong was sharing the placeholder.
    expect(row.description).toBe(TITLE);
    expect(row.narrative).toBe(BODY);
    expect(row.build).toBe(PROMPT);
    expect(row.acceptance).toEqual(['Given the board, the Command Center renders first.']);
    expect(row.status).toBe('not_started');
  });

  it('NEGATIVE CONTROL: the pre-fix INSERT fails on this very table, with the production error', async () => {
    // The statement EXACTLY as it shipped and failed: `$4` shared by title and description, and
    // the whole tail shifted down one so the parameter count still matches the bind array. Without
    // that shift the server could reject it for supplying 10 binds to an 11-parameter statement -
    // a different error, and a control that proves the wrong thing.
    const broken = COMMAND_CENTER_INSERT_SQL
      .replace('$4, $5, $6, $7, $8::jsonb', '$4, $4, $5, $6, $7::jsonb')
      .replace("'not_started', $9, $10, $11", "'not_started', $8, $9, $10");
    expect(broken).not.toBe(COMMAND_CENTER_INSERT_SQL); // or the control proves nothing
    expect(broken).toContain('$4, $4');
    expect(broken).not.toContain('$11');

    await expect(sequelize.query(broken, {
      bind: [ROW_ID, LIST_ID, PROJECT_ID, TITLE, BODY, PROMPT, ACCEPTANCE, 5, STORY_ID, 'r0'],
      type: QueryTypes.INSERT,
    })).rejects.toThrow(/inconsistent types deduced for parameter \$4/);
  });

  it('REFRESHes content without touching status, and is idempotent on a second pass', async () => {
    // The refresh branch is the one a SECOND run takes. Its broken form meant the half of the
    // script that proves idempotency could never execute.
    await sequelize.query('UPDATE student_tasks SET status = $2 WHERE id = $1', {
      bind: [ROW_ID, 'in_progress'],
    });

    const refresh = () => sequelize.query(COMMAND_CENTER_REFRESH_SQL, {
      bind: [LIST_ID, PROJECT_ID, 'Refreshed title', 'Refreshed title', 'new body', 'new prompt',
        JSON.stringify(['Refreshed criterion.']), STORY_ID],
      type: QueryTypes.UPDATE,
    });

    await refresh();
    const once = await readRow();
    expect(once.title).toBe('Refreshed title');
    expect(once.description).toBe('Refreshed title');
    expect(once.narrative).toBe('new body');
    expect(once.acceptance).toEqual(['Refreshed criterion.']);
    // A builder's progress survives a content refresh.
    expect(once.status).toBe('in_progress');
    expect(once.position).toBe(5);

    await refresh();
    const twice = await readRow();
    expect(twice).toEqual(once);
  });

  it('NEGATIVE CONTROL: the pre-fix refresh UPDATE fails the same way', async () => {
    const broken = COMMAND_CENTER_REFRESH_SQL
      .replace('title = $3, description = $4', 'title = $3, description = $3')
      .replace('narrative = $5, build = $6', 'narrative = $4, build = $5')
      .replace('acceptance = $7::jsonb', 'acceptance = $6::jsonb')
      .replace('story_id = $8', 'story_id = $7');
    expect(broken).not.toBe(COMMAND_CENTER_REFRESH_SQL);
    expect(broken).toContain('title = $3, description = $3');
    expect(broken).not.toContain('$8');

    await expect(sequelize.query(broken, {
      bind: [LIST_ID, PROJECT_ID, 'x', 'body', 'prompt', JSON.stringify(['c']), STORY_ID],
      type: QueryTypes.UPDATE,
    })).rejects.toThrow(/inconsistent types deduced for parameter \$3/);
  });

  it('the INSERT is ON CONFLICT DO NOTHING, so a re-run cannot duplicate the row', async () => {
    await runInsert(COMMAND_CENTER_INSERT_SQL);

    const [{ n }] = await sequelize.query<{ n: string }>(
      'SELECT count(*)::int AS n FROM student_tasks WHERE id = $1',
      { bind: [ROW_ID], type: QueryTypes.SELECT },
    );
    expect(Number(n)).toBe(1);
  });
});
