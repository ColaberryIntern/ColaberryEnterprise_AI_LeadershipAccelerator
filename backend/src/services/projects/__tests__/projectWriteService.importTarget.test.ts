/**
 * importProject — WHICH project the mirrored snapshot lands in.
 *
 * The browser keeps the student's builds in localStorage and mirrors one of them
 * up on page load. It picks the payload with `loadProjects().find((p) =>
 * !p.sample)` — position zero — and the server then wrote that snapshot into
 * whatever project happened to be ACTIVE, because `createProjectForEnrollment`
 * returns the active project rather than the project the snapshot is OF.
 *
 * With one build those are the same row and nothing is wrong. With two they are
 * routinely different, and the snapshot of build A lands on build B's rows —
 * the same class of defect as the wizard building a new plan into the old
 * project, reached through the mirror instead. There is already a measured
 * incident in this file's sibling from 2026-08-13 where a stale client snapshot
 * rewrote all 18 tasks of a freshly published plan; the guard added then
 * (`hasPublishedBuild`) only covers projects that have PUBLISHED, which leaves
 * every in-progress second build exposed.
 *
 * The payload now names its project and the server targets it — after
 * re-checking ownership, so a forged id reaches nothing the caller did not
 * already own.
 */

const mockTransaction = jest.fn();
const mockListFindOrCreate = jest.fn();
const mockTaskFindOrCreate = jest.fn();
const mockGetOwnedProjectTree = jest.fn();
const mockCreateProjectForEnrollment = jest.fn();
const mockProjectFindOne = jest.fn();
const mockQuery = jest.fn();

jest.mock('../../../config/database', () => ({
  sequelize: {
    transaction: (...args: any[]) => mockTransaction(...args),
    query: (...args: any[]) => mockQuery(...args),
  },
}));
jest.mock('../../../models/Project', () => ({
  __esModule: true,
  default: { findByPk: jest.fn(), findOne: (...a: any[]) => mockProjectFindOne(...a) },
}));
jest.mock('../../../models/StudentTaskList', () => ({
  __esModule: true,
  default: { findOrCreate: (...a: any[]) => mockListFindOrCreate(...a) },
}));
jest.mock('../../../models/StudentTask', () => ({
  __esModule: true,
  default: {
    findOrCreate: (...a: any[]) => mockTaskFindOrCreate(...a),
    create: jest.fn(),
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
const ACTIVE_PROJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';   // build B — currently active
const SNAPSHOT_PROJECT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; // build A — what the browser is mirroring
const TX = { __tx: true };

const PAYLOAD = {
  name: 'CoreOps',
  lists: [{ cluster: 'r0', title: 'Release 0', tasks: [{ story_id: 'STORY-001', title: 'First story' }] }],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([[], []]);              // no published build
  mockCreateProjectForEnrollment.mockResolvedValue({ id: ACTIVE_PROJECT });
  mockGetOwnedProjectTree.mockImplementation(async (_e: string, id: string) => ({ id, lists: [] }));
  mockTransaction.mockImplementation(async (cb: any) => cb(TX));
  mockListFindOrCreate.mockImplementation(async ({ where }: any) => [{ id: `list-${where.cluster}`, update: jest.fn() }, true]);
  mockTaskFindOrCreate.mockImplementation(async ({ defaults }: any) => [{ ...defaults, update: jest.fn() }, true]);
  mockProjectFindOne.mockResolvedValue(null);
});

describe('the snapshot lands on the project it is a snapshot OF', () => {
  it('writes into the project the payload names, not the active one', async () => {
    mockProjectFindOne.mockResolvedValue({ id: SNAPSHOT_PROJECT });

    await importProject(ENROLLMENT, { ...PAYLOAD, project_id: SNAPSHOT_PROJECT } as any);

    expect(mockCreateProjectForEnrollment).not.toHaveBeenCalled();
    const listWhere = mockListFindOrCreate.mock.calls[0][0].where;
    expect(listWhere.project_id).toBe(SNAPSHOT_PROJECT);
    const taskDefaults = mockTaskFindOrCreate.mock.calls[0][0].where;
    expect(taskDefaults.project_id).toBe(SNAPSHOT_PROJECT);
  });

  it('scopes the ownership lookup to the caller and to live projects only', async () => {
    mockProjectFindOne.mockResolvedValue({ id: SNAPSHOT_PROJECT });

    await importProject(ENROLLMENT, { ...PAYLOAD, project_id: SNAPSHOT_PROJECT } as any);

    expect(mockProjectFindOne).toHaveBeenCalledWith({
      where: { id: SNAPSHOT_PROJECT, enrollment_id: ENROLLMENT, archived_at: null },
    });
  });

  it('ignores a project_id belonging to somebody else', async () => {
    // findOne is enrollment-scoped, so a foreign id simply does not resolve.
    mockProjectFindOne.mockResolvedValue(null);

    await importProject(ENROLLMENT, { ...PAYLOAD, project_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' } as any);

    // Falls back to the caller's own active project rather than writing anywhere
    // it was pointed. The forged id reaches nothing.
    expect(mockCreateProjectForEnrollment).toHaveBeenCalledWith(ENROLLMENT);
    expect(mockListFindOrCreate.mock.calls[0][0].where.project_id).toBe(ACTIVE_PROJECT);
  });

  it('ignores an archived project_id', async () => {
    mockProjectFindOne.mockResolvedValue(null);   // archived_at: null excludes it

    await importProject(ENROLLMENT, { ...PAYLOAD, project_id: SNAPSHOT_PROJECT } as any);

    expect(mockCreateProjectForEnrollment).toHaveBeenCalledWith(ENROLLMENT);
  });

  it('still works for an older client that sends no project_id', async () => {
    await importProject(ENROLLMENT, PAYLOAD as any);

    expect(mockProjectFindOne).not.toHaveBeenCalled();
    expect(mockCreateProjectForEnrollment).toHaveBeenCalledWith(ENROLLMENT);
    expect(mockListFindOrCreate.mock.calls[0][0].where.project_id).toBe(ACTIVE_PROJECT);
  });

  it('returns the tree of the project it actually wrote to', async () => {
    mockProjectFindOne.mockResolvedValue({ id: SNAPSHOT_PROJECT });

    const tree = await importProject(ENROLLMENT, { ...PAYLOAD, project_id: SNAPSHOT_PROJECT } as any);

    // The client claims the returned id as its backend identity, so returning
    // the WRONG project's tree would rebind the local card to another build.
    expect(tree).toEqual({ id: SNAPSHOT_PROJECT, lists: [] });
  });
});
