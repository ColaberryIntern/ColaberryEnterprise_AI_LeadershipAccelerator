/**
 * resolveProjectForNewBuild — a second build must never land inside the first.
 *
 * THE BUG THIS SUITE HOLDS SHUT. Reported 2026-08-19: a student with a build
 * called CoreOps started a second one called Ambit and it "merged with CoreOps
 * instead of creating a separate build". The DRI hit the same thing days
 * earlier — a new project appeared to absorb and replace the previous one,
 * mid-demo.
 *
 * The cause was not in this file, because this function did not exist. The
 * BROWSER decided which project a new build went into: `resolveBackendProjectId`
 * in frontend/src/services/sbpApi.ts called `GET /api/portal/projects/active`
 * and built into whatever came back. With a build already present that is the
 * first project's row, and the whole pipeline then ran against it —
 * `saveIntake` overwrites on `ON CONFLICT (project_id)`, `publishPlan` marks the
 * previous plan `superseded`, and `materializePlanAsTasks` upserts on
 * `(project_id, story_id)` where BOTH plans number their stories STORY-001
 * upward. So the second plan's stories landed on the first plan's task rows.
 *
 * The decision moved server-side, and these tests are the contract:
 *
 *   1. a project that has ever been built into is NEVER reused;
 *   2. a genuinely empty project IS reused, so a new student is not left with a
 *      stray blank card (the legitimate concern the old client-side reuse had);
 *   3. two concurrent resolves get two different projects, because the reuse
 *      path claims the row before it returns;
 *   4. resolving a second project does not touch the first project's row.
 *
 * The models are faked in-memory rather than mocked call-by-call: the property
 * under test is "which row comes back, and what happened to the other one",
 * and a `toHaveBeenCalledWith` assertion cannot see a row.
 */

const PROTECTED_ID = 'fcce50ef-fe01-471d-a3ff-cd6948d092c2';
const ENROLLMENT = 'e0000000-0000-4000-8000-000000000001';
const PROGRAM = 'a0000000-0000-4000-8000-0000000000aa';

interface FakeProject {
  id: string;
  enrollment_id: string;
  program_id: string;
  archived_at: string | null;
  project_stage: string;
  setup_status: Record<string, unknown>;
  name?: string | null;
  [k: string]: unknown;
  update: (patch: Record<string, unknown>, opts?: unknown) => Promise<FakeProject>;
}

/** Rows the fake `projects` table holds, plus the SBP content keyed by project. */
const db = {
  projects: [] as FakeProject[],
  intake: new Set<string>(),
  plans: new Set<string>(),
  tasks: new Map<string, number>(),
  enrollment: { id: ENROLLMENT, active_project_id: null as string | null, company: 'Acme', saves: 0 },
  seq: 0,
};

function makeProject(attrs: Partial<FakeProject> & { id?: string }): FakeProject {
  db.seq += 1;
  const row: any = {
    id: attrs.id ?? `p0000000-0000-4000-8000-${String(db.seq).padStart(12, '0')}`,
    enrollment_id: ENROLLMENT,
    program_id: PROGRAM,
    archived_at: null,
    project_stage: 'discovery',
    setup_status: {},
    name: null,
    ...attrs,
  };
  row.update = async (patch: Record<string, unknown>) => { Object.assign(row, patch); return row; };
  return row as FakeProject;
}

jest.mock('../../config/database', () => ({
  sequelize: {
    // The real one takes a row lock and runs the body inside it. The lock is
    // asserted separately (below) by inspecting the statement.
    transaction: async (fn: (t: unknown) => Promise<unknown>) => fn({ FAKE_TX: true }),
    query: jest.fn(async (sql: string, opts: any) => {
      queries.push(String(sql));
      if (/FROM build_intake/.test(sql)) {
        const pid = opts?.replacements?.projectId;
        return [{ intake: String(db.intake.has(pid) ? 1 : 0), plans: String(db.plans.has(pid) ? 1 : 0) }];
      }
      return [{ id: ENROLLMENT }];
    }),
  },
}));

const queries: string[] = [];

jest.mock('../../models/Project', () => ({
  __esModule: true,
  default: {
    create: jest.fn(async (attrs: any) => { const row = makeProject(attrs); db.projects.push(row); return row; }),
    findByPk: jest.fn(async (id: string) => db.projects.find((p) => p.id === id) ?? null),
    findOne: jest.fn(async ({ where }: any) => db.projects.find((p) => {
      if (where.id && p.id !== where.id) return false;
      if (where.enrollment_id && p.enrollment_id !== where.enrollment_id) return false;
      if ('archived_at' in where && where.archived_at === null && p.archived_at !== null) return false;
      return true;
    }) ?? null),
    findAll: jest.fn(async () => db.projects),
  },
}));

jest.mock('../../models/ProjectArtifact', () => ({ __esModule: true, default: {} }));

jest.mock('../../models', () => ({
  Enrollment: {
    findByPk: jest.fn(async (id: string) => (id === ENROLLMENT ? {
      ...db.enrollment,
      get active_project_id() { return db.enrollment.active_project_id; },
      set active_project_id(v: string | null) { db.enrollment.active_project_id = v; },
      save: async () => { db.enrollment.saves += 1; },
    } : null)),
  },
  Cohort: {},
  UserCurriculumProfile: {},
  ArtifactDefinition: {},
  AssignmentSubmission: {},
  StudentTask: { count: jest.fn(async ({ where }: any) => db.tasks.get(where.project_id) ?? 0) },
}));

import { resolveProjectForNewBuild } from '../projectService';

/** A stable, order-independent snapshot of everything a project row carries. */
function fingerprint(p: FakeProject): string {
  const { update, ...data } = p as any;
  return JSON.stringify(Object.keys(data).sort().map((k) => [k, data[k]]));
}

beforeEach(() => {
  db.projects = [];
  db.intake.clear();
  db.plans.clear();
  db.tasks.clear();
  db.enrollment = { id: ENROLLMENT, active_project_id: null, company: 'Acme', saves: 0 };
  db.seq = 0;
  queries.length = 0;
  const { Enrollment } = jest.requireMock('../../models');
  Enrollment.findByPk.mockImplementation(async (id: string) => (id === ENROLLMENT ? {
    id: ENROLLMENT,
    company: 'Acme',
    cohort: { program_id: PROGRAM },
    curriculumProfile: null,
    get active_project_id() { return db.enrollment.active_project_id; },
    set active_project_id(v: string | null) { db.enrollment.active_project_id = v; },
    save: async () => { db.enrollment.saves += 1; },
  } : null));
});

describe('a project that has been built into is never reused', () => {
  it.each([
    ['an intake', (id: string) => db.intake.add(id)],
    ['a generated plan', (id: string) => db.plans.add(id)],
    ['materialized tasks', (id: string) => db.tasks.set(id, 12)],
  ])('creates a NEW project when the active one already has %s', async (_label, seed) => {
    const first = makeProject({ name: 'CoreOps' });
    db.projects.push(first);
    db.enrollment.active_project_id = first.id;
    seed(first.id);

    const { project, reused } = await resolveProjectForNewBuild(ENROLLMENT);

    expect(reused).toBe(false);
    expect(project.id).not.toBe(first.id);
    expect(db.projects).toHaveLength(2);
  });

  it('leaves the first project byte-identical when the second is created', async () => {
    const first = makeProject({ name: 'CoreOps', setup_status: { activated: true } });
    db.projects.push(first);
    db.enrollment.active_project_id = first.id;
    db.plans.add(first.id);
    db.tasks.set(first.id, 18);

    const before = fingerprint(first);
    const { project } = await resolveProjectForNewBuild(ENROLLMENT);
    const after = fingerprint(db.projects.find((p) => p.id === first.id)!);

    expect(project.id).not.toBe(first.id);
    // The whole point. Creating Ambit may not write a single byte of CoreOps.
    expect(after).toBe(before);
  });

  it('makes the new project active without disturbing the old one', async () => {
    const first = makeProject({ name: 'CoreOps' });
    db.projects.push(first);
    db.enrollment.active_project_id = first.id;
    db.intake.add(first.id);

    const { project } = await resolveProjectForNewBuild(ENROLLMENT);

    expect(db.enrollment.active_project_id).toBe(project.id);
    expect(first.archived_at).toBeNull();
    expect(first.name).toBe('CoreOps');
  });
});

describe('an empty project is reused rather than stacking a blank card', () => {
  it('reuses the active project when nothing has ever been built into it', async () => {
    const blank = makeProject({});
    db.projects.push(blank);
    db.enrollment.active_project_id = blank.id;

    const { project, reused } = await resolveProjectForNewBuild(ENROLLMENT);

    expect(reused).toBe(true);
    expect(project.id).toBe(blank.id);
    expect(db.projects).toHaveLength(1);
  });

  it('creates one when the student has no active project at all', async () => {
    const { project, reused } = await resolveProjectForNewBuild(ENROLLMENT);

    expect(reused).toBe(false);
    expect(db.projects).toHaveLength(1);
    expect(project.id).toBe(db.projects[0].id);
  });

  it('does not reuse an archived project', async () => {
    const gone = makeProject({ archived_at: '2026-08-01T00:00:00Z' });
    db.projects.push(gone);
    db.enrollment.active_project_id = gone.id;

    const { project, reused } = await resolveProjectForNewBuild(ENROLLMENT);

    expect(reused).toBe(false);
    expect(project.id).not.toBe(gone.id);
  });

  it('never reuses the platform record, even empty and active', async () => {
    // fcce50ef… is the platform's own ~144k-row project. It sits on a real
    // enrollment, so "reuse the active project" points straight at it.
    const platform = makeProject({ id: PROTECTED_ID });
    db.projects.push(platform);
    db.enrollment.active_project_id = PROTECTED_ID;

    const { project, reused } = await resolveProjectForNewBuild(ENROLLMENT);

    expect(reused).toBe(false);
    expect(project.id).not.toBe(PROTECTED_ID);
  });
});

describe('two builds started at once get two projects', () => {
  it('does not hand the same pristine project to a second resolve', async () => {
    const blank = makeProject({});
    db.projects.push(blank);
    db.enrollment.active_project_id = blank.id;

    const first = await resolveProjectForNewBuild(ENROLLMENT);
    const second = await resolveProjectForNewBuild(ENROLLMENT);

    expect(first.project.id).toBe(blank.id);
    expect(first.reused).toBe(true);
    // The reuse path CLAIMED the row on the way out, so it is no longer a
    // candidate. Without the claim both callers build into `blank` — which is
    // the original merge bug reached through a different door.
    expect(second.project.id).not.toBe(blank.id);
    expect(second.reused).toBe(false);
    expect(db.projects).toHaveLength(2);
  });

  it('claims the row it reuses so the claim survives for the next caller', async () => {
    const blank = makeProject({});
    db.projects.push(blank);
    db.enrollment.active_project_id = blank.id;

    await resolveProjectForNewBuild(ENROLLMENT);

    expect((blank.setup_status as any).build_claimed_at).toEqual(expect.any(String));
  });

  it('stamps a freshly created project as claimed too', async () => {
    const { project } = await resolveProjectForNewBuild(ENROLLMENT);
    expect(((project as any).setup_status || {}).build_claimed_at).toEqual(expect.any(String));
  });

  it('serialises concurrent resolves with a row lock on the enrollment', async () => {
    // The claim only closes the race if the two resolves cannot interleave
    // between the read and the stamp. That is what FOR UPDATE buys.
    await resolveProjectForNewBuild(ENROLLMENT);
    expect(queries.some((q) => /FROM enrollments WHERE id = :enrollmentId FOR UPDATE/.test(q))).toBe(true);
  });
});
