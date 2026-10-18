/**
 * The enrollment row lock is a real serialiser, proved against REAL Postgres.
 *
 * Session CC-20261001-q7m4. The LAST of the seven locks this programme listed as "covered only
 * by asserting their SQL contains FOR UPDATE".
 *
 * ## The test it already had
 *
 * `resolveProjectForNewBuild.test.ts:283` is titled *"serialises concurrent resolves with a row
 * lock on the enrollment"*. Its body:
 *
 *     await resolveProjectForNewBuild(ENROLLMENT);
 *     expect(queries.some((q) => /FROM enrollments WHERE id = :enrollmentId FOR UPDATE/.test(q)))
 *       .toBe(true);
 *
 * ONE resolve, then a regex over the captured SQL. The title promises serialisation; the body
 * asserts a substring. Nothing in it could tell two concurrent resolves from one.
 *
 * ## Why this lock matters more than most
 *
 * It closes a defect a STUDENT reported on 2026-08-19: a new build that "merged with" the old
 * one. Two builds started in the same instant both found the same pristine project and both
 * built into it, so the second plan's stories landed on the first plan's rows and the card kept
 * the first build's name while every task under it described the second. The lock plus the
 * `build_claimed_at` stamp is what makes the second caller always get its own project.
 *
 * ## The controls
 *
 * - `POSITIVE CONTROL` replays the pre-fix decision - read the active project, check it is
 *   pristine, stamp it - with no lock and both reads before either write, and asserts both
 *   callers claim the SAME project. That is the reported bug, reproduced.
 * - The schema is created from the MODELS (`sequelize.sync()`) and from the production SBP DDL
 *   (`ensureSbpSchema`), not from hand-written copies. Note that `sync()` does not reproduce
 *   production's column DEFAULTS - measured earlier in this programme - which is fine here
 *   because every write in this suite goes through Sequelize or through that same DDL.
 *
 * ── Running it ────────────────────────────────────────────────────────────────────────
 *
 *   docker run --rm -d --name resolve-pg-test -p 55439:5432 \
 *     -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=resolve_test \
 *     postgres:16-alpine
 *
 *   # from backend/, once pg_isready reports "accepting connections":
 *   DATABASE_URL=postgres://test:test@127.0.0.1:55439/resolve_test \
 *     npx jest -c jest.config.ts src/services/__tests__/resolveProjectForNewBuildRace
 *
 *   docker rm -f resolve-pg-test
 *
 * Port 55439: 55433-55438 belong to the five earlier race suites and the telemetry anchor, so
 * all seven can run at once. Throwaway credentials, one run, nothing persists. With no
 * `DATABASE_URL` the suite SKIPS AND SAYS SO.
 *
 * It must never be pointed at production: `sequelize.sync()` would touch every table.
 */
import { QueryTypes } from 'sequelize';

jest.setTimeout(300_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[resolveProjectForNewBuildRace] SKIPPED: no DATABASE_URL. This suite needs a real Postgres; '
    + 'the docblock has the one-line docker run and the exact command. It is NOT evidence that '
    + 'two concurrent resolves get their own projects unless it actually ran.',
  );
}

describeIfDb('the enrollment row lock gives each concurrent build its own project', () => {
  let sequelize: import('sequelize').Sequelize;
  let resolveProjectForNewBuild: typeof import('../projectService').resolveProjectForNewBuild;
  let models: typeof import('../../models');

  let programId: string;
  let cohortId: string;
  let enrollmentId: string;

  /**
   * Jest renders a Sequelize error as an EMPTY failure body here, so every database call says
   * what it was doing.
   */
  const explain = async <T>(what: string, run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (err) {
      throw new Error(`${what} failed: ${(err as Error).message}`);
    }
  };

  beforeAll(async () => {
    ({ sequelize } = await import('../../config/database'));
    ({ resolveProjectForNewBuild } = await import('../projectService'));
    models = await import('../../models');

    // ONLY the models this path touches, in dependency order, each from its own definition.
    //
    // NOT `sequelize.sync()` over the whole model set: that works on a virgin database and
    // then HANGS on a second run against the same one - measured, a beforeAll that blew a
    // 300-second hook timeout. A suite that passes once and hangs the next time is broken,
    // so the bootstrap is scoped to what this suite needs and stays replayable.
    for (const model of [
      // Order is the FK order: UserCurriculumProfile references enrollments, so Enrollment
      // comes first, and Enrollment references cohorts, which reference program_blueprints.
      models.ProgramBlueprint, models.Cohort, models.Enrollment,
      models.UserCurriculumProfile, models.Tenant, models.Project,
    ]) {
      await explain(`sync ${model.name}`, () => model.sync());
    }

    // `student_tasks` is a deliberate STUB, and the only one here. Syncing the real model
    // drags in student_task_lists, then requirements_maps, and from there
    // artifact_definitions, capabilities and features - a widening chain, none of which this
    // lock touches. `hasBuildContent` only ever asks `StudentTask.count({ project_id })`, and
    // that is all this table has to answer. (`student_tasks` is also one of the two tables in
    // this repo with no DDL anywhere, which is its own register entry.)
    await explain('creating the student_tasks stub', () => sequelize.query(
      `CREATE TABLE IF NOT EXISTS student_tasks (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         project_id UUID NOT NULL
       )`,
    ));

    const { ensureSbpSchema } = await import('../../db/ensureSbpSchema');
    await explain('ensureSbpSchema()', () => ensureSbpSchema());

    // A cohort's `program_id` points at program_blueprints, not at a table called "programs".
    const program = await explain('creating the program blueprint', () => models.ProgramBlueprint.create({
      name: 'Race Harness Program',
    } as never));
    programId = String((program as unknown as { id: string }).id);

    const cohort = await explain('creating the cohort', () => models.Cohort.create({
      program_id: programId,
      name: 'Race Harness Cohort',
      start_date: new Date('2026-01-05'),
      core_day: 'Monday',
      core_time: '18:00',
    } as never));
    cohortId = String((cohort as unknown as { id: string }).id);
  });

  afterAll(async () => {
    await sequelize.close();
  });

  /** A student with ONE project that has never been built into - the reusable case. */
  async function seedPristineEnrollment(): Promise<string> {
    const enrollment = await explain('creating the enrollment', () => models.Enrollment.create({
      cohort_id: cohortId,
      full_name: 'Race Harness Student',
      email: `race-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`,
      company: 'Race Harness Co',
    } as never));
    enrollmentId = String((enrollment as unknown as { id: string }).id);

    const project = await explain('creating the pristine project', () => models.Project.create({
      enrollment_id: enrollmentId,
      program_id: programId,
      project_stage: 'discovery',
      project_variables: {},
      setup_status: { requirements_loaded: false, activated: false },
    } as never));
    const projectId = String((project as unknown as { id: string }).id);

    await explain('pointing the enrollment at it', () => sequelize.query(
      'UPDATE enrollments SET active_project_id = $2 WHERE id = $1',
      { bind: [enrollmentId, projectId], type: QueryTypes.UPDATE },
    ));
    return projectId;
  }

  const projectIdsFor = async (): Promise<string[]> => {
    const rows = await sequelize.query<{ id: string }>(
      'SELECT id FROM projects WHERE enrollment_id = $1 ORDER BY created_at',
      { bind: [enrollmentId], type: QueryTypes.SELECT },
    );
    return rows.map((r) => r.id);
  };

  it('TWO CONCURRENT RESOLVES get two different projects', async () => {
    const pristine = await seedPristineEnrollment();

    const [a, b] = await Promise.all([
      resolveProjectForNewBuild(enrollmentId),
      resolveProjectForNewBuild(enrollmentId),
    ]);

    // The property the student's bug report comes down to: two builds, two project rows.
    expect(String(a.project.id)).not.toBe(String(b.project.id));
    // Exactly one of them was allowed to reuse the pristine row.
    expect([a.reused, b.reused].filter(Boolean)).toHaveLength(1);
    const reusedOne = a.reused ? a : b;
    expect(String(reusedOne.project.id)).toBe(pristine);
    expect(await projectIdsFor()).toHaveLength(2);
  });

  it('the reuse STAMP makes the row ineligible for the next resolve', async () => {
    const pristine = await seedPristineEnrollment();

    const first = await resolveProjectForNewBuild(enrollmentId);
    expect(first.reused).toBe(true);
    expect(String(first.project.id)).toBe(pristine);

    const second = await resolveProjectForNewBuild(enrollmentId);
    expect(second.reused).toBe(false);
    expect(String(second.project.id)).not.toBe(pristine);
  });

  it('a project with build content is NEVER reused, even when it is the active one', async () => {
    const pristine = await seedPristineEnrollment();
    // One intake row is build content. The check is an OR over intake, plans and tasks.
    await explain('seeding build content', () => sequelize.query(
      "INSERT INTO build_intake (project_id, idea, status) VALUES ($1, $2, 'draft')",
      { bind: [pristine, 'a synthetic idea, so the row satisfies NOT NULL'], type: QueryTypes.INSERT },
    ));

    const result = await resolveProjectForNewBuild(enrollmentId);

    expect(result.reused).toBe(false);
    expect(String(result.project.id)).not.toBe(pristine);
  });

  it('POSITIVE CONTROL: the pre-fix decision gives both builds the SAME project', async () => {
    // Mandatory, and it is the reported bug. Read the active project, decide it is pristine,
    // stamp it - with no lock, and both reads taken before either write.
    const pristine = await seedPristineEnrollment();

    const decide = async (): Promise<string | null> => {
      const rows = await sequelize.query<{ id: string; setup_status: Record<string, unknown> | null }>(
        `SELECT p.id, p.setup_status
           FROM enrollments e JOIN projects p ON p.id = e.active_project_id
          WHERE e.id = $1 AND p.archived_at IS NULL`,
        { bind: [enrollmentId], type: QueryTypes.SELECT },
      );
      const row = rows[0];
      if (!row) return null;
      return (row.setup_status || {}).build_claimed_at ? null : row.id;
    };
    const [first, second] = await Promise.all([decide(), decide()]);

    // Both unlocked callers chose the same row to build into. That is the merge.
    expect(first).toBe(pristine);
    expect(second).toBe(pristine);
  });
});
