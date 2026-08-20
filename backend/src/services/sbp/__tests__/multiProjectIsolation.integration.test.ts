/**
 * Multi-project isolation, proven against a REAL Postgres.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE UNIT SUITE. Every other test of this
 * pipeline fakes the model layer, and the defect it is guarding against is
 * precisely a fact about rows: a second build landing on the first build's
 * `student_tasks`, `build_intake` and `build_plans`. An in-memory table cannot
 * prove that the real `ON CONFLICT (project_id)` clause, the real partial unique
 * index on `(project_id, story_id)`, and the real `superseded` UPDATE leave the
 * first project alone. So this suite talks to a database.
 *
 * OPT-IN, per CLAUDE.md's integration-testing rule. It is skipped unless
 * SBP_INTEGRATION_DB=1, and it refuses to run at all against a database whose
 * name does not look disposable — this suite CREATES AND DELETES ROWS, and
 * pointing it at a real environment would be an incident, not a test.
 *
 *   docker run -d --name mp-test-pg -e POSTGRES_PASSWORD=testpw \
 *     -e POSTGRES_USER=testuser -e POSTGRES_DB=mp_test -p 55432:5432 \
 *     pgvector/pgvector:pg15
 *   SBP_INTEGRATION_DB=1 \
 *   DATABASE_URL=postgres://testuser:testpw@localhost:55432/mp_test \
 *     npx jest src/services/sbp/__tests__/multiProjectIsolation.integration.test.ts
 *
 * WHAT IT HOLDS. Two things, and the second is the reason the first matters:
 *
 *   1. ISOLATION — `resolveProjectForNewBuild` hands a second build its own
 *      project, and generating that build leaves every row of the first project
 *      byte-identical. Fingerprinted across projects, build_intake, build_plans,
 *      student_tasks and student_task_lists.
 *   2. CHARACTERIZATION — running a second build INTO an existing project
 *      really does corrupt it. This is what the browser used to do on every
 *      "Start a new build", and it is asserted rather than described so that
 *      nobody later decides the resolver is over-cautious. It passes before and
 *      after the fix; it is evidence, not a regression guard.
 */
import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { createHash } from 'crypto';

const RUN = process.env.SBP_INTEGRATION_DB === '1';
const describeDb = RUN ? describe : describe.skip;

// Guard rail. `accelerator_prod`, `accelerator_dev`, anything with a real name:
// refuse. Only a database that announces itself as scratch is acceptable.
const DB_URL = process.env.DATABASE_URL ?? '';
const DB_NAME = DB_URL.split('/').pop()?.split('?')[0] ?? '';
if (RUN && !/(^|[_-])(test|scratch|throwaway)([_-]|$)|^mp_test$/i.test(DB_NAME)) {
  throw new Error(
    `refusing to run destructive integration tests against database "${DB_NAME}". `
    + 'Point DATABASE_URL at a disposable database whose name contains "test".',
  );
}

import { sequelize } from '../../../config/database';
import { ensureSbpSchema } from '../../../db/ensureSbpSchema';
import { saveIntake, savePlanDraft, publishPlan } from '../planStore';
import { materializePlanAsTasks } from '../materializeTasks';
import { BuildPlan } from '../planContract';
import { resolveProjectForNewBuild } from '../../projectService';

jest.setTimeout(180_000);

const ENROLLMENT = randomUUID();
const COHORT = randomUUID();
const PROGRAM = randomUUID();
/** Everything this suite creates, so teardown can prove it removed it all. */
const created = { projects: [] as string[] };

/**
 * A plan whose stories collide with every other plan's by id — STORY-001
 * upward, exactly as the decomposer numbers them. The collision is the point:
 * `(project_id, story_id)` is the task identity key, so two plans in one project
 * fight over the same rows.
 */
function planFixture(name: string, storyCount: number): BuildPlan {
  const requirements = Array.from({ length: storyCount }, (_, i) => ({
    id: `REQ-${String(i + 1).padStart(3, '0')}`,
    statement: `${name} requirement ${i + 1}: the system records and reports outcome ${i + 1}.`,
    kind: 'FUNC' as const,
    priority: 'must' as const,
    cluster: 'core',
  }));
  return {
    project_name: name,
    descriptor: `${name} descriptor`,
    requirements,
    releases: [
      { key: 'r0', name: `${name} skeleton`, goal: 'Walking skeleton', demo: 'A run end to end', week_start: 1, week_end: 2 },
      { key: 'r1', name: `${name} depth`, goal: 'Real behaviour', demo: 'A real outcome', week_start: 3, week_end: 4 },
    ],
    stories: Array.from({ length: storyCount }, (_, i) => ({
      id: `STORY-${String(i + 1).padStart(3, '0')}`,
      release: i < 2 ? 'r0' : 'r1',
      title: `${name} story ${i + 1}`,
      narrative: `As an operator, I want ${name} capability ${i + 1}, so that outcome ${i + 1} is reliable.`,
      fulfills: [requirements[i].id],
      owner_agent: `${name} agent`,
      acceptance: [
        `Given ${name} is running, when input ${i + 1} arrives, then it is recorded.`,
        `Given a failure, when it happens, then it is surfaced.`,
        `Trust: the operator can see why outcome ${i + 1} was produced.`,
      ],
      task_guidance: `Implement ${name} capability ${i + 1}.`,
      failure_paths: [`${name} upstream unavailable`],
    })),
  };
}

/** Run a whole build into `projectId`, exactly as the pipeline's write half does. */
async function runBuildInto(projectId: string, plan: BuildPlan, idea: string): Promise<void> {
  await saveIntake({
    project_id: projectId,
    enrollment_id: ENROLLMENT,
    idea,
    name: plan.project_name,
    answers: [{ id: 'q1', question: 'Who uses it?', answer: `${plan.project_name} operators` }],
    status: 'generating',
  });
  const draft = await savePlanDraft(projectId, plan, { gate: { ok: true, violations: [] } as any });
  await publishPlan(projectId, draft.version, draft.plan_sha256);
  await materializePlanAsTasks(projectId, ENROLLMENT, plan, {});
}

/**
 * A stable hash of EVERY row this project owns across the five tables a build
 * writes. Volatile columns (`updated_at`) are excluded deliberately: the claim
 * being made is that the second build does not touch the first project's
 * CONTENT, and a timestamp that moved without any content changing would be a
 * different (and much smaller) problem than the one under test.
 */
async function fingerprint(projectId: string): Promise<{ hash: string; detail: Record<string, unknown> }> {
  const detail: Record<string, unknown> = {};

  detail.project = await sequelize.query(
    `SELECT id, name, organization_name, project_stage, archived_at, requirements_document
       FROM projects WHERE id = :projectId`,
    { type: QueryTypes.SELECT, replacements: { projectId } },
  );
  detail.intake = await sequelize.query(
    `SELECT project_id, idea, name, size, users, data_sources, done_definition, target_weeks, status, answers
       FROM build_intake WHERE project_id = :projectId ORDER BY project_id`,
    { type: QueryTypes.SELECT, replacements: { projectId } },
  );
  detail.plans = await sequelize.query(
    `SELECT version, status, plan_sha256, gate_ok, plan_json
       FROM build_plans WHERE project_id = :projectId ORDER BY version`,
    { type: QueryTypes.SELECT, replacements: { projectId } },
  );
  detail.lists = await sequelize.query(
    `SELECT cluster, title, position, status
       FROM student_task_lists WHERE project_id = :projectId ORDER BY cluster`,
    { type: QueryTypes.SELECT, replacements: { projectId } },
  );
  detail.tasks = await sequelize.query(
    `SELECT story_id, requirement_key, title, description, narrative, position, owner_agent,
            release_key, acceptance, fulfills, build, blocked_by, due_on, due_baseline_on, status
       FROM student_tasks WHERE project_id = :projectId ORDER BY story_id`,
    { type: QueryTypes.SELECT, replacements: { projectId } },
  );

  return { hash: createHash('sha256').update(JSON.stringify(detail)).digest('hex'), detail };
}

async function seedEnrollment(): Promise<void> {
  await sequelize.query(
    `INSERT INTO program_blueprints (id, name, is_active, version, created_at, updated_at)
     VALUES (:id, 'Isolation Test Program', true, 1, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`,
    { replacements: { id: PROGRAM } },
  );
  await sequelize.query(
    `INSERT INTO cohorts (id, program_id, name, start_date, core_day, core_time, created_at)
     VALUES (:id, :programId, 'Isolation Test Cohort', CURRENT_DATE, 'Tuesday', '18:00', NOW())
     ON CONFLICT (id) DO NOTHING`,
    { replacements: { id: COHORT, programId: PROGRAM } },
  );
  await sequelize.query(
    `INSERT INTO enrollments (id, cohort_id, email, full_name, company, status, enrolled_at)
     VALUES (:id, :cohortId, :email, 'Isolation Fixture', 'Isolation Fixture Co', 'active', NOW())
     ON CONFLICT (id) DO NOTHING`,
    { replacements: { id: ENROLLMENT, cohortId: COHORT, email: `isolation+${ENROLLMENT}@example.test` } },
  );
}

describeDb('multi-project isolation (real database)', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
    await ensureSbpSchema();
    await seedEnrollment();
  });

  afterAll(async () => {
    // Remove everything this suite made, children first. The fixture enrollment
    // is synthetic and belongs to nobody, but leaving rows behind in any
    // database is how a "test" becomes someone else's confusing Monday.
    for (const projectId of created.projects) {
      await sequelize.query('DELETE FROM student_tasks WHERE project_id = :projectId', { replacements: { projectId } });
      await sequelize.query('DELETE FROM student_task_lists WHERE project_id = :projectId', { replacements: { projectId } });
      await sequelize.query('DELETE FROM build_plans WHERE project_id = :projectId', { replacements: { projectId } });
      await sequelize.query('DELETE FROM build_intake WHERE project_id = :projectId', { replacements: { projectId } });
    }
    await sequelize.query('DELETE FROM projects WHERE enrollment_id = :id', { replacements: { id: ENROLLMENT } });
    await sequelize.query('DELETE FROM enrollments WHERE id = :id', { replacements: { id: ENROLLMENT } });
    await sequelize.query('DELETE FROM cohorts WHERE id = :id', { replacements: { id: COHORT } });
    await sequelize.query('DELETE FROM program_blueprints WHERE id = :id', { replacements: { id: PROGRAM } });
    await sequelize.close();
  });

  it('gives a second build its own project and leaves the first byte-identical', async () => {
    // ── build one: "CoreOps" ────────────────────────────────────────────────
    const a = await resolveProjectForNewBuild(ENROLLMENT);
    created.projects.push(a.project.id);
    await runBuildInto(a.project.id, planFixture('CoreOps', 6), 'An operations console for a small logistics team.');

    const before = await fingerprint(a.project.id);

    // ── build two: "Ambit", started the way a student starts one ────────────
    const b = await resolveProjectForNewBuild(ENROLLMENT);
    created.projects.push(b.project.id);

    expect(b.project.id).not.toBe(a.project.id);
    expect(b.reused).toBe(false);

    await runBuildInto(b.project.id, planFixture('Ambit', 4), 'A market intelligence agent for commercial property.');

    // ── the assertion the whole change exists for ───────────────────────────
    const after = await fingerprint(a.project.id);
    // Printed because "byte-identical" is the claim this whole change is making,
    // and a reader deserves to see the two numbers rather than trust a green tick.
    console.log(JSON.stringify({
      event: 'multi_project_isolation_fingerprint',
      project_a: a.project.id,
      project_b: b.project.id,
      before: before.hash,
      after: after.hash,
      identical: before.hash === after.hash,
      a_tasks: (before.detail.tasks as unknown[]).length,
      a_plans: (before.detail.plans as unknown[]).length,
    }));
    expect(after.hash).toBe(before.hash);

    // And the second build genuinely landed, in its own rows.
    const bTasks: Array<{ n: string }> = await sequelize.query(
      'SELECT count(*)::text AS n FROM student_tasks WHERE project_id = :projectId',
      { type: QueryTypes.SELECT, replacements: { projectId: b.project.id } },
    );
    expect(Number(bTasks[0].n)).toBeGreaterThan(0);

    // The two projects share story ids and must still not share rows.
    const shared: Array<{ n: string }> = await sequelize.query(
      `SELECT count(*)::text AS n FROM student_tasks a
         JOIN student_tasks b ON a.story_id = b.story_id AND a.id = b.id
        WHERE a.project_id = :aId AND b.project_id = :bId`,
      { type: QueryTypes.SELECT, replacements: { aId: a.project.id, bId: b.project.id } },
    );
    expect(Number(shared[0].n)).toBe(0);
  });

  it('keeps a third build isolated from both of the first two', async () => {
    const [a, b] = [created.projects[0], created.projects[1]];
    const beforeA = await fingerprint(a);
    const beforeB = await fingerprint(b);

    const c = await resolveProjectForNewBuild(ENROLLMENT);
    created.projects.push(c.project.id);
    expect([a, b]).not.toContain(c.project.id);

    await runBuildInto(c.project.id, planFixture('Thirdly', 5), 'A scheduling assistant for field service crews.');

    expect((await fingerprint(a)).hash).toBe(beforeA.hash);
    expect((await fingerprint(b)).hash).toBe(beforeB.hash);
  });

  it('hands two projects to two resolves fired at once', async () => {
    // What a student does when the first press appears to have done nothing.
    const [one, two] = await Promise.all([
      resolveProjectForNewBuild(ENROLLMENT),
      resolveProjectForNewBuild(ENROLLMENT),
    ]);
    created.projects.push(one.project.id, two.project.id);
    expect(one.project.id).not.toBe(two.project.id);
  });

  it('never resolves onto a project owned by a different enrollment', async () => {
    const mine = new Set(created.projects);
    const rows: Array<{ id: string }> = await sequelize.query(
      'SELECT id FROM projects WHERE enrollment_id = :id',
      { type: QueryTypes.SELECT, replacements: { id: ENROLLMENT } },
    );
    // Everything the resolver produced belongs to the fixture enrollment, and
    // nothing else was adopted from the wider table.
    for (const id of mine) expect(rows.map((r) => r.id)).toContain(id);
  });

  /**
   * CHARACTERIZATION — not a regression guard.
   *
   * This is what the browser did on every "Start a new build" before the fix:
   * point the pipeline at the project that was already active. It corrupts the
   * project, and this test says so out loud so that the resolver above is never
   * mistaken for excessive caution.
   */
  it('CHARACTERIZATION: a second build run INTO an existing project rewrites it', async () => {
    const victim = await resolveProjectForNewBuild(ENROLLMENT);
    created.projects.push(victim.project.id);
    await runBuildInto(victim.project.id, planFixture('Original', 6), 'The build the student already had.');
    const before = await fingerprint(victim.project.id);

    await runBuildInto(victim.project.id, planFixture('Replacement', 4), 'A completely different idea.');
    const after = await fingerprint(victim.project.id);

    // The damage, itemised.
    expect(after.hash).not.toBe(before.hash);

    // 1. one intake per project, enforced by build_intake_unique_project — the
    //    first build's idea and answers are simply gone.
    const intake = after.detail.intake as Array<{ idea: string; name: string }>;
    expect(intake).toHaveLength(1);
    expect(intake[0].idea).toBe('A completely different idea.');

    // 2. the first plan is demoted rather than kept alongside.
    const plans = after.detail.plans as Array<{ version: number; status: string }>;
    expect(plans).toHaveLength(2);
    expect(plans.find((p) => p.version === 1)!.status).toBe('superseded');
    expect(plans.find((p) => p.version === 2)!.status).toBe('published');

    // 3. the second plan's stories landed on the first plan's task rows, and
    //    the stories it does not re-emit are orphaned rather than removed.
    const tasks = after.detail.tasks as Array<{ story_id: string; title: string }>;
    const story1 = tasks.find((t) => t.story_id === 'STORY-001')!;
    expect(story1.title).toContain('Replacement');
    expect(tasks.find((t) => t.story_id === 'STORY-006')!.title).toContain('Original');
  });
});
