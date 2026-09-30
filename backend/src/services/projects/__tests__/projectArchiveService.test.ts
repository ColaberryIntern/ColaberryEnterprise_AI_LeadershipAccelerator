/**
 * projectArchiveService — the archive is reversible, the counts are real, and
 * nothing in the task tables is touched.
 *
 * The four properties under test, in the order the risk sits:
 *
 *  1. THE POINTER. `enrollments.active_project_id` has no FK and no ON DELETE.
 *     Archiving the active project must repoint it deliberately — to another live
 *     project when one exists, to NULL when none does, and never to the platform
 *     record `fcce50ef` that the "newest remaining project" fallback would
 *     otherwise reach.
 *  2. THE COUNTS. The confirmation names what the student is giving up. Every
 *     number is read live from the project, so a test that asserts them has to
 *     assert against distinct fixture values — matching counts that happen to be
 *     equal proves nothing.
 *  3. NO TASK WRITES. The 24 hand-ticked completions of Quincy, Shabana, Liza and
 *     Farhat live in LEGACY lists (clusters like `p1786587289890-L1`, or a bare
 *     UUID) that sit OUTSIDE the published plan's `r0…r4` on the SAME project.
 *     An archive must not delete, prune or reparent them. Proven by asserting the
 *     task models are never written to at all.
 *  4. REVERSIBILITY. Restore puts the row back with nothing lost.
 */
import { Op } from 'sequelize';

const PLATFORM_PROJECT = 'fcce50ef-fe01-471d-a3ff-cd6948d092c2';
const OWNER = 'aced5b39-0b47-496a-b172-e1f5c042bf8a';
const ACTIVE_PROJECT = 'cce94c20-a398-45b3-a6fb-b3fc87b6b1ef';
const OTHER_LIVE_PROJECT = '40a5cea6-ace8-4734-8220-7e62df2111e5';

interface Row { id: string; enrollment_id: string; name: string | null; archived_at: Date | null; created_at: string }
let rows: Row[] = [];
let pointer: string | null = null;

// Every write the task tables receive, so "nothing was touched" is an assertion
// about observed calls rather than a hope.
const taskWrites: string[] = [];

const asModel = (r: Row) => ({ ...r, get: () => ({ ...r }) });

jest.mock('../../../models/Project', () => ({
  __esModule: true,
  default: {
    findByPk: async (id: unknown) => {
      const r = rows.find((x) => x.id === String(id));
      return r ? asModel(r) : null;
    },
    findOne: async ({ where, order }: any) => {
      const list = filterRows(where);
      if (order) list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return list[0] ? asModel(list[0]) : null;
    },
    findAll: async ({ where, order }: any) => {
      const list = filterRows(where);
      if (order) list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return list.map(asModel);
    },
    update: async (values: any, opts: any) => {
      const r = rows.find((x) => x.id === String(opts.where.id));
      if (r) r.archived_at = values.archived_at ?? null;
      return [r ? 1 : 0];
    },
    create: async () => { throw new Error('create must not be called by archive/restore'); },
  },
}));
jest.mock('../../../models/ProjectArtifact', () => ({ __esModule: true, default: {} }));

/** Honours the exact clause shapes projectService builds, Op symbols included. */
function filterRows(where: any): Row[] {
  const excluded: string[] = (where.id?.[Op.notIn] ?? []).map(String);
  const wantsArchived = where.archived_at != null && Op.ne in where.archived_at;
  return rows
    .filter((r) => r.enrollment_id === String(where.enrollment_id))
    .filter((r) => (wantsArchived ? r.archived_at != null
      : where.archived_at === null ? r.archived_at == null : true))
    .filter((r) => (where.id && typeof where.id === 'string' ? r.id === where.id : true))
    .filter((r) => !excluded.includes(r.id));
}

// ── task tables: counts are fixtures; any WRITE is recorded and asserted absent ──
let taskFixtures: {
  total: number; complete: number; lists: number;
  verified: { story_id: string; verified_at: Date; verified_ref: string }[];
} = { total: 0, complete: 0, lists: 0, verified: [] };

jest.mock('../../../models/StudentTask', () => ({
  __esModule: true,
  default: {
    count: async ({ where }: any) => {
      if (where.status === 'complete') return taskFixtures.complete;
      if (where.verified_at) return taskFixtures.verified.length;
      return taskFixtures.total;
    },
    findAll: async () => taskFixtures.verified.map((v) => ({ ...v, get: () => ({ ...v }) })),
    update: async () => { taskWrites.push('StudentTask.update'); return [0]; },
    destroy: async () => { taskWrites.push('StudentTask.destroy'); return 0; },
  },
}));
jest.mock('../../../models/StudentTaskList', () => ({
  __esModule: true,
  default: {
    count: async () => taskFixtures.lists,
    update: async () => { taskWrites.push('StudentTaskList.update'); return [0]; },
    destroy: async () => { taskWrites.push('StudentTaskList.destroy'); return 0; },
  },
}));

let repoRow: { repo_owner: string; repo_name: string } | null = null;
jest.mock('../../../models/GitHubConnection', () => ({
  __esModule: true,
  default: { findOne: async () => repoRow },
}));

jest.mock('../../../models', () => ({
  __esModule: true,
  Enrollment: {
    findByPk: async (id: unknown) => (String(id) === OWNER ? { id: OWNER, active_project_id: pointer } : null),
    update: async (values: any) => { pointer = values.active_project_id ?? null; return [1]; },
  },
}));

let publishedPlan = false;
jest.mock('../../../config/database', () => ({
  __esModule: true,
  sequelize: {
    transaction: async (fn: any) => fn({}),
    query: async () => [publishedPlan ? [{ '1': 1 }] : [], []],
  },
}));

let awardedXp = 0;
jest.mock('../projectReadService', () => ({
  __esModule: true,
  verifiedStoryXp: async () => awardedXp,
}));

import {
  getArchivePreview, archiveProject, restoreProject, ArchiveError,
} from '../projectArchiveService';
import {
  listProjectsForEnrollment, getProjectByEnrollment, listArchivedProjectsForEnrollment,
  listArchivableProjectsForEnrollment, setActiveProject,
} from '../../projectService';

beforeEach(() => {
  rows = [
    { id: PLATFORM_PROJECT, enrollment_id: OWNER, name: null, archived_at: null, created_at: '2026-04-02' },
    { id: OTHER_LIVE_PROJECT, enrollment_id: OWNER, name: 'Older Build', archived_at: null, created_at: '2026-08-01' },
    { id: ACTIVE_PROJECT, enrollment_id: OWNER, name: 'Student Early Warning', archived_at: null, created_at: '2026-08-16' },
  ];
  pointer = ACTIVE_PROJECT;
  taskWrites.length = 0;
  taskFixtures = { total: 0, complete: 0, lists: 0, verified: [] };
  repoRow = null;
  publishedPlan = false;
  awardedXp = 0;
});

// ─── 1. the pointer ──────────────────────────────────────────────────────────
describe('archiving the ACTIVE project repoints active_project_id sanely', () => {
  it('moves the pointer to the newest other LIVE project, never the platform record', async () => {
    const result = await archiveProject(OWNER, ACTIVE_PROJECT);

    expect(result.active_project_id).toBe(OTHER_LIVE_PROJECT);
    expect(result.active_project_id).not.toBe(PLATFORM_PROJECT);
    expect(pointer).toBe(OTHER_LIVE_PROJECT);
  });

  it('goes to NULL — not to fcce50ef — when the platform record is all that is left', async () => {
    // Exactly the production shape: Ali's enrollment holds the platform record
    // plus one real build. Archiving the build leaves only infrastructure, and
    // "newest remaining project" would resolve to it.
    rows = rows.filter((r) => r.id !== OTHER_LIVE_PROJECT);

    const result = await archiveProject(OWNER, ACTIVE_PROJECT);

    expect(result.active_project_id).toBeNull();
    expect(pointer).toBeNull();
    // And the resolver agrees: no path leads back to the platform record.
    const resolved = await getProjectByEnrollment(OWNER);
    expect(resolved).toBeNull();
  });

  it('leaves the pointer alone when archiving a NON-active project', async () => {
    await archiveProject(OWNER, OTHER_LIVE_PROJECT);
    expect(pointer).toBe(ACTIVE_PROJECT);
  });

  it('refuses the platform record and writes nothing', async () => {
    await expect(archiveProject(OWNER, PLATFORM_PROJECT)).rejects.toThrow(ArchiveError);
    expect(rows.find((r) => r.id === PLATFORM_PROJECT)!.archived_at).toBeNull();
    expect(pointer).toBe(ACTIVE_PROJECT);
  });
});

// ─── 2. the counts ───────────────────────────────────────────────────────────
describe('the confirmation counts match live data', () => {
  beforeEach(() => {
    // Deliberately all-different numbers: if the service crossed two of these
    // wires, equal fixtures would hide it.
    taskFixtures = {
      total: 21,
      complete: 7,
      lists: 6,
      verified: [
        { story_id: 'STORY-000', verified_at: new Date('2026-08-16'), verified_ref: 'a'.repeat(40) },
        { story_id: 'STORY-001', verified_at: new Date('2026-08-16'), verified_ref: 'b'.repeat(40) },
        { story_id: 'STORY-002', verified_at: new Date('2026-08-16'), verified_ref: 'c'.repeat(40) },
      ],
    };
    publishedPlan = true;
    awardedXp = 53;
    repoRow = { repo_owner: 'ColaberryIntern', repo_name: 'AcceleratorTesting' };
  });

  it('reports every figure the copy quotes, each distinct and from the project', async () => {
    const p = await getArchivePreview(OWNER, ACTIVE_PROJECT);

    expect(p.name).toBe('Student Early Warning');
    expect(p.task_count).toBe(21);
    expect(p.completed_task_count).toBe(7);
    expect(p.task_list_count).toBe(6);
    expect(p.confirmed_story_count).toBe(3);
    expect(p.has_published_plan).toBe(true);
    expect(p.points_awarded).toBe(53);
    expect(p.repo_connected).toBe(true);
    expect(p.repo_full_name).toBe('ColaberryIntern/AcceleratorTesting');
    expect(p.is_active).toBe(true);
    expect(p.next_active_project_id).toBe(OTHER_LIVE_PROJECT);
  });

  it('says there is no published plan and no repo when there is neither', async () => {
    publishedPlan = false;
    repoRow = null;

    const p = await getArchivePreview(OWNER, ACTIVE_PROJECT);

    expect(p.has_published_plan).toBe(false);
    expect(p.repo_connected).toBe(false);
    expect(p.repo_full_name).toBeNull();
  });

  it('promises no destination for a non-active project', async () => {
    const p = await getArchivePreview(OWNER, OTHER_LIVE_PROJECT);

    expect(p.is_active).toBe(false);
    expect(p.next_active_project_id).toBeNull();
  });
});

// ─── 3. no task writes: the legacy lists survive ─────────────────────────────
describe('legacy task lists are never orphaned or pruned', () => {
  it('archives without a single write to student_tasks or student_task_lists', async () => {
    taskFixtures = {
      total: 27, complete: 10, lists: 10,
      verified: [],
    };
    await archiveProject(OWNER, ACTIVE_PROJECT);

    // The 10 hand-ticked completions sitting in `p1786587289890-L1..L4` are
    // untouched because nothing wrote to either table at all.
    expect(taskWrites).toEqual([]);
  });

  it('restores without a single write to student_tasks or student_task_lists', async () => {
    await archiveProject(OWNER, ACTIVE_PROJECT);
    taskWrites.length = 0;

    await restoreProject(OWNER, ACTIVE_PROJECT);

    expect(taskWrites).toEqual([]);
  });
});

// ─── 4. it vanishes, and it comes back ───────────────────────────────────────
describe('an archived project vanishes from listings and active-project resolution', () => {
  it('drops out of listProjectsForEnrollment', async () => {
    const before = (await listProjectsForEnrollment(OWNER)).map((p) => String(p.id));
    expect(before).toContain(ACTIVE_PROJECT);

    await archiveProject(OWNER, ACTIVE_PROJECT);

    const after = (await listProjectsForEnrollment(OWNER)).map((p) => String(p.id));
    expect(after).not.toContain(ACTIVE_PROJECT);
    expect(after).toEqual([OTHER_LIVE_PROJECT, PLATFORM_PROJECT]);
  });

  it('drops out of the archivable list and appears in the archived list', async () => {
    await archiveProject(OWNER, ACTIVE_PROJECT);

    const archivable = (await listArchivableProjectsForEnrollment(OWNER)).map((p) => String(p.id));
    const archived = (await listArchivedProjectsForEnrollment(OWNER)).map((p) => String(p.id));

    expect(archivable).toEqual([OTHER_LIVE_PROJECT]);
    expect(archived).toEqual([ACTIVE_PROJECT]);
  });

  it('is no longer resolvable as the active project', async () => {
    await archiveProject(OWNER, ACTIVE_PROJECT);

    const resolved = await getProjectByEnrollment(OWNER);
    expect(String(resolved!.id)).toBe(OTHER_LIVE_PROJECT);
  });

  it('cannot be switched back to via setActiveProject — restore is the only way back', async () => {
    await archiveProject(OWNER, ACTIVE_PROJECT);

    const switched = await setActiveProject(OWNER, ACTIVE_PROJECT);
    expect(switched).toBeNull();
  });
});

describe('restore returns the project intact', () => {
  it('puts it back in the listings with its name and id unchanged', async () => {
    await archiveProject(OWNER, ACTIVE_PROJECT);

    const result = await restoreProject(OWNER, ACTIVE_PROJECT);

    expect(result.changed).toBe(true);
    const live = await listProjectsForEnrollment(OWNER);
    const back = live.find((p) => String(p.id) === ACTIVE_PROJECT);
    expect(back).toBeDefined();
    expect((back as any).name).toBe('Student Early Warning');
    expect(rows.find((r) => r.id === ACTIVE_PROJECT)!.archived_at).toBeNull();
  });

  it('does NOT yank the student back off the build they were moved to', async () => {
    await archiveProject(OWNER, ACTIVE_PROJECT);
    expect(pointer).toBe(OTHER_LIVE_PROJECT);

    await restoreProject(OWNER, ACTIVE_PROJECT);

    expect(pointer).toBe(OTHER_LIVE_PROJECT);
  });

  it('adopts the restored project when the student has no active project at all', async () => {
    rows = rows.filter((r) => r.id !== OTHER_LIVE_PROJECT);
    await archiveProject(OWNER, ACTIVE_PROJECT);
    expect(pointer).toBeNull();

    const result = await restoreProject(OWNER, ACTIVE_PROJECT);

    expect(result.active_project_id).toBe(ACTIVE_PROJECT);
    expect(pointer).toBe(ACTIVE_PROJECT);
  });
});

describe('archive is idempotent', () => {
  it('reports changed:false and the ORIGINAL timestamp on a second call', async () => {
    const first = await archiveProject(OWNER, ACTIVE_PROJECT);
    const second = await archiveProject(OWNER, ACTIVE_PROJECT);

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.archived_at).toBe(first.archived_at);
    // And the pointer did not move a second time.
    expect(pointer).toBe(OTHER_LIVE_PROJECT);
  });

  it('reports changed:false when restoring a project that is already live', async () => {
    const result = await restoreProject(OWNER, ACTIVE_PROJECT);
    expect(result.changed).toBe(false);
  });
});

describe('ownership', () => {
  it('answers 404 for a project on another enrollment', async () => {
    const stranger = '11111111-2222-4333-8444-555555555555';
    await expect(archiveProject(stranger, ACTIVE_PROJECT)).rejects.toMatchObject({ status: 404 });
    expect(rows.find((r) => r.id === ACTIVE_PROJECT)!.archived_at).toBeNull();
  });

  it('answers 404 for a project id that does not exist', async () => {
    await expect(
      getArchivePreview(OWNER, '00000000-0000-4000-8000-000000000000'),
    ).rejects.toMatchObject({ status: 404 });
  });
});
