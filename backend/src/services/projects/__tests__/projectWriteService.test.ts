/**
 * importProject — the persistence path for a student's build (SBP-REQ-v1 r0).
 *
 * Regression coverage for docs/BUILD_PIPELINE_AUDIT.md finding F-1: production
 * carried a non-partial UNIQUE (project_id, requirement_key) on student_tasks,
 * so the first task that RE-cited a requirement raised a unique violation and
 * aborted the import. Every student build persisted exactly 3 tasks and then
 * 500'd, and the frontend's bare `catch {}` hid it. These tests pin the two
 * invariants that fix it:
 *
 *   FR-012 — one requirement is fulfilled by MANY stories
 *   FR-013 — the whole plan lands in ONE transaction (no partial project)
 *
 * Models and the sequelize instance are mocked: this is the service's control
 * flow under test, not Postgres.
 */

const mockTransaction = jest.fn();
const mockListFindOrCreate = jest.fn();
const mockTaskFindOrCreate = jest.fn();
const mockTaskCreate = jest.fn();
const mockGetOwnedProjectTree = jest.fn();
const mockCreateProjectForEnrollment = jest.fn();

const mockQuery = jest.fn();

jest.mock('../../../config/database', () => ({
  sequelize: {
    transaction: (...args: any[]) => mockTransaction(...args),
    query: (...args: any[]) => mockQuery(...args),
  },
}));
jest.mock('../../../models/Project', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../../models/StudentTaskList', () => ({
  __esModule: true,
  default: { findOrCreate: (...a: any[]) => mockListFindOrCreate(...a) },
}));
jest.mock('../../../models/StudentTask', () => ({
  __esModule: true,
  default: {
    findOrCreate: (...a: any[]) => mockTaskFindOrCreate(...a),
    create: (...a: any[]) => mockTaskCreate(...a),
    findOne: jest.fn(),
    update: jest.fn(),
  },
}));
jest.mock('../../projectService', () => ({
  createProjectForEnrollment: (...a: any[]) => mockCreateProjectForEnrollment(...a),
  getProjectByEnrollment: jest.fn(),
}));
jest.mock('../projectReadService', () => ({
  getOwnedProjectTree: (...a: any[]) => mockGetOwnedProjectTree(...a),
}));

import { importProject } from '../projectWriteService';

const ENROLLMENT = 'enr-1';
const PROJECT_ID = 'proj-1';
const TX = { __tx: true };

/** The exact shape production generated: t1→R1, t2→R4, t3→R2, t4→R2 (the collision). */
const SKELETON_PAYLOAD = {
  name: 'My Build',
  lists: [
    {
      cluster: 'p1-L1',
      title: 'Project DNA & Requirements',
      tasks: [
        { story_id: 'p1-t1', requirement_key: 'R1', title: 'Lock the core requirements' },
        { story_id: 'p1-t2', requirement_key: 'R4', title: 'Map the safety guardrail' },
      ],
    },
    {
      cluster: 'p1-L2',
      title: 'Core build',
      tasks: [
        { story_id: 'p1-t3', requirement_key: 'R2', title: 'Scaffold the MCP server' },
        { story_id: 'p1-t4', requirement_key: 'R2', title: 'Implement the read tool' },
        { story_id: 'p1-t5', requirement_key: 'R3', title: 'Implement the core action' },
        { story_id: 'p1-t6', requirement_key: 'R2', title: 'Connect the live preview' },
      ],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([[], []]); // no published build unless a test says so
  mockCreateProjectForEnrollment.mockResolvedValue({ id: PROJECT_ID });
  mockGetOwnedProjectTree.mockResolvedValue({ id: PROJECT_ID, lists: [] });
  // Run the callback with a stub transaction, mimicking sequelize.transaction.
  mockTransaction.mockImplementation(async (cb: any) => cb(TX));
  mockListFindOrCreate.mockImplementation(async ({ where }: any) => [{ id: `list-${where.cluster}` }, true]);
  mockTaskFindOrCreate.mockImplementation(async ({ defaults }: any) => [{ ...defaults, update: jest.fn() }, true]);
});

describe('importProject — FR-012: many stories may fulfil one requirement', () => {
  it('persists every task even when three of them cite the same requirement', async () => {
    await importProject(ENROLLMENT, SKELETON_PAYLOAD as any);

    expect(mockTaskFindOrCreate).toHaveBeenCalledTimes(6);
    const reqKeys = mockTaskFindOrCreate.mock.calls.map((c) => c[0].defaults.requirement_key);
    expect(reqKeys).toEqual(['R1', 'R4', 'R2', 'R2', 'R3', 'R2']);
  });

  it('keys task identity on story_id, never on requirement_key, when a story_id exists', async () => {
    await importProject(ENROLLMENT, SKELETON_PAYLOAD as any);

    for (const call of mockTaskFindOrCreate.mock.calls) {
      const where = call[0].where;
      expect(where).toHaveProperty('story_id');
      expect(where).not.toHaveProperty('requirement_key');
    }
  });

  it('falls back to requirement_key only for legacy rows that carry no story_id', async () => {
    await importProject(ENROLLMENT, {
      lists: [{ cluster: 'c', tasks: [{ requirement_key: 'R9', title: 'legacy row' }] }],
    } as any);

    expect(mockTaskFindOrCreate.mock.calls[0][0].where).toEqual({
      project_id: PROJECT_ID,
      requirement_key: 'R9',
    });
  });

  it('regression — the production payload yields 6 tasks, not the 3 it stopped at', async () => {
    // Simulate the OLD behaviour to prove the test would have caught it: a unique
    // violation on the second task citing R2 (the 4th task overall).
    const seen = new Set<string>();
    mockTaskFindOrCreate.mockImplementation(async ({ defaults }: any) => {
      const key = `${defaults.project_id}:${defaults.requirement_key}`;
      if (seen.has(key)) throw new Error('duplicate key value violates unique constraint "student_tasks_unique_req_key"');
      seen.add(key);
      return [{ ...defaults, update: jest.fn() }, true];
    });

    await expect(importProject(ENROLLMENT, SKELETON_PAYLOAD as any)).rejects.toThrow(
      /student_tasks_unique_req_key/,
    );
    // 4 attempts: t1, t2, t3 succeed, t4 throws — exactly the 3 rows found in prod.
    expect(mockTaskFindOrCreate).toHaveBeenCalledTimes(4);
  });
});

describe('importProject — FR-013: one transaction, no partial project', () => {
  it('opens exactly one transaction and threads it through every write', async () => {
    await importProject(ENROLLMENT, SKELETON_PAYLOAD as any);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    for (const call of mockListFindOrCreate.mock.calls) expect(call[0].transaction).toBe(TX);
    for (const call of mockTaskFindOrCreate.mock.calls) expect(call[0].transaction).toBe(TX);
  });

  it('propagates a mid-loop failure so the transaction rolls back the whole plan', async () => {
    mockTaskFindOrCreate
      .mockImplementationOnce(async ({ defaults }: any) => [{ ...defaults, update: jest.fn() }, true])
      .mockImplementationOnce(async ({ defaults }: any) => [{ ...defaults, update: jest.fn() }, true])
      .mockImplementationOnce(async () => { throw new Error('db exploded'); });

    await expect(importProject(ENROLLMENT, SKELETON_PAYLOAD as any)).rejects.toThrow('db exploded');
    // The error escapes the transaction callback — sequelize rolls back. The
    // service must NOT swallow it and must not read a tree from a dead tx.
    expect(mockGetOwnedProjectTree).not.toHaveBeenCalled();
  });

  it('reads the resulting tree only after the transaction has committed', async () => {
    const order: string[] = [];
    mockTransaction.mockImplementation(async (cb: any) => { await cb(TX); order.push('commit'); });
    mockGetOwnedProjectTree.mockImplementation(async () => { order.push('read'); return { id: PROJECT_ID, lists: [] }; });

    await importProject(ENROLLMENT, SKELETON_PAYLOAD as any);

    expect(order).toEqual(['commit', 'read']);
  });

  it('is idempotent — a re-import updates existing rows instead of duplicating them', async () => {
    const update = jest.fn();
    mockTaskFindOrCreate.mockImplementation(async ({ defaults }: any) => [
      { ...defaults, status: 'not_started', update }, false,   // already exists
    ]);

    await importProject(ENROLLMENT, SKELETON_PAYLOAD as any);

    expect(mockTaskCreate).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(6);
    for (const call of update.mock.calls) expect(call[1]).toEqual({ transaction: TX });
  });

  it('never regresses a completed task on the bulk path (FR-014)', async () => {
    const update = jest.fn();
    mockTaskFindOrCreate.mockImplementation(async ({ defaults }: any) => [
      { ...defaults, status: 'complete', update }, false,
    ]);

    await importProject(ENROLLMENT, {
      lists: [{ cluster: 'c', tasks: [{ story_id: 's1', title: 't', status: 'not_started' }] }],
    } as any);

    expect(update.mock.calls[0][0].status).toBe('complete');
  });
});

describe('importProject refuses to overwrite a published build', () => {
  /**
   * MEASURED, 2026-08-13, production, on ali@colaberry.com's own account.
   * A plan was published at 08:30:09 and became the active project. At
   * 08:35:25 the portal mirrored the browser's localStorage — a DIFFERENT,
   * older project — and because `createProjectForEnrollment` returns the
   * ACTIVE project, all 18 published tasks were rewritten with the old
   * project's content. Both plans number their stories STORY-001 upward and
   * story_id is the identity key, so every single row matched and was
   * overwritten. The published lists were left empty beside six new ones.
   *
   * Every student in the cohort would have hit this the moment they opened
   * the portal after publishing.
   */
  const publishedBuild = () => mockQuery.mockResolvedValue([[{ '?column?': 1 }], []]);

  it('writes nothing when the target project has a published plan', async () => {
    publishedBuild();

    await importProject(ENROLLMENT, SKELETON_PAYLOAD as any);

    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockListFindOrCreate).not.toHaveBeenCalled();
    expect(mockTaskFindOrCreate).not.toHaveBeenCalled();
    expect(mockTaskCreate).not.toHaveBeenCalled();
  });

  it('still returns the project tree, so the portal renders the published plan', async () => {
    publishedBuild();
    mockGetOwnedProjectTree.mockResolvedValue({ id: PROJECT_ID, lists: [{ cluster: 'r0' }] });

    const tree = await importProject(ENROLLMENT, SKELETON_PAYLOAD as any);

    expect(tree).toEqual({ id: PROJECT_ID, lists: [{ cluster: 'r0' }] });
    expect(mockGetOwnedProjectTree).toHaveBeenCalledWith(ENROLLMENT, PROJECT_ID);
  });

  it('asks about the project it is about to write, not the enrollment', async () => {
    publishedBuild();

    await importProject(ENROLLMENT, SKELETON_PAYLOAD as any);

    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/build_plans/);
    expect(sql).toMatch(/status = 'published'/);
    expect(opts.bind).toEqual({ pid: PROJECT_ID });
  });

  it('imports normally when the project has no published plan', async () => {
    // The legacy client-only projects this path was written for must still work.
    await importProject(ENROLLMENT, SKELETON_PAYLOAD as any);

    expect(mockTransaction).toHaveBeenCalled();
    expect(mockTaskFindOrCreate).toHaveBeenCalledTimes(6);
  });
});
