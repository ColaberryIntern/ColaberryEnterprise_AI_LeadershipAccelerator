/**
 * A student confirms their own Demo Prep task, and is paid for it — the ONE
 * client-reachable path to `complete`, and why it stays safe.
 *
 * Ali, 2026-09-14: "Demo should have points in the Project section as well."
 * PREP-1..PREP-6 are rehearsals nothing in a repo can confirm; the workspace
 * already let the student confirm them, but only into localStorage — the
 * server never heard of it, so nothing could pay it. This path records the
 * confirmation on the server and pays it.
 *
 * Written to be hostile to the change: the guard must refuse every non-PREP
 * story with the same 409 the status routes use, a task the student does not
 * own must read as "not found", a replay must pay nothing, and the kill switch
 * must stop the award without stopping the completion.
 *
 * Models and sequelize are mocked, matching projectTaskStatusGuard.test.ts.
 */
const mockProjectFindByPk = jest.fn();
const mockTaskFindByPk = jest.fn();
const mockTaskFindOne = jest.fn();
const mockTaskUpdate = jest.fn();
const mockAward = jest.fn();
const envState = { portalPointsAwardEnabled: true };

jest.mock('../../../config/database', () => ({ sequelize: { transaction: jest.fn(), query: jest.fn() } }));
jest.mock('../../../models/Project', () => ({ __esModule: true, default: { findByPk: (...a: any[]) => mockProjectFindByPk(...a) } }));
jest.mock('../../../models/StudentTaskList', () => ({ __esModule: true, default: {} }));
jest.mock('../../../models/StudentTask', () => ({
  __esModule: true,
  default: {
    findByPk: (...a: any[]) => mockTaskFindByPk(...a),
    findOne: (...a: any[]) => mockTaskFindOne(...a),
    update: (...a: any[]) => mockTaskUpdate(...a),
  },
}));
jest.mock('../../projectService', () => ({ createProjectForEnrollment: jest.fn(), getProjectByEnrollment: jest.fn() }));
jest.mock('../projectReadService', () => ({ getOwnedProjectTree: jest.fn() }));
jest.mock('../../pointsService', () => ({ award: (...a: any[]) => mockAward(...a) }));
jest.mock('../../../config/env', () => ({ env: envState }));

import { completeSelfDirectedTask, SELF_DIRECTED_SOURCE, PREP_DONE_EVENT } from '../projectWriteService';
import { PREP_TASK_POINTS } from '../../sbp/prepTaskPoints';

const ENROLLMENT = 'enr-1';
const PROJECT_ID = 'proj-1';
const TASK_ID = 'task-1';

const task = (over: Partial<any> = {}) => ({
  id: TASK_ID, project_id: PROJECT_ID, story_id: 'PREP-2', status: 'not_started',
  verified_at: null, verified_by: null, verified_ref: null, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  envState.portalPointsAwardEnabled = true;
  mockProjectFindByPk.mockResolvedValue({ id: PROJECT_ID, enrollment_id: ENROLLMENT });
  mockTaskFindByPk.mockResolvedValue(task());
  mockTaskFindOne.mockResolvedValue(task());   // markTaskVerifiedComplete's own lookup
  mockTaskUpdate.mockResolvedValue([1]);
  mockAward.mockResolvedValue({ awarded: true, points: PREP_TASK_POINTS });
});

describe('the happy path', () => {
  it('records the completion on the server, stamped as the student\'s own confirmation', async () => {
    const r = await completeSelfDirectedTask(ENROLLMENT, TASK_ID);
    expect(r).toEqual({ id: TASK_ID, story_id: 'PREP-2', status: 'complete', points_awarded: PREP_TASK_POINTS, already: false });
    expect(mockTaskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'complete', verified_by: SELF_DIRECTED_SOURCE, verified_ref: null }),
      { where: { id: TASK_ID } },
    );
  });

  it('pays the HUD ledger under the Today feed ref, the same key a verified story uses', async () => {
    await completeSelfDirectedTask(ENROLLMENT, TASK_ID);
    expect(mockAward).toHaveBeenCalledTimes(1);
    expect(mockAward).toHaveBeenCalledWith(ENROLLMENT, expect.objectContaining({
      eventType: PREP_DONE_EVENT,
      eventKey: `project:${TASK_ID}`,
      points: PREP_TASK_POINTS,
      metadata: expect.objectContaining({ project_id: PROJECT_ID, story_id: 'PREP-2' }),
    }));
  });
});

describe('the guard — this can never become a second way to finish a build story', () => {
  it.each(['STORY-001', 'STORY-000', 'STORY-014'])('refuses %s with the 409 the status routes use, touching nothing', async (storyId) => {
    mockTaskFindByPk.mockResolvedValue(task({ story_id: storyId }));
    await expect(completeSelfDirectedTask(ENROLLMENT, TASK_ID)).rejects.toMatchObject({ status: 409, error_class: 'ForbiddenStateTransition' });
    expect(mockTaskUpdate).not.toHaveBeenCalled();
    expect(mockAward).not.toHaveBeenCalled();
  });

  it('refuses a legacy task with no story id at all', async () => {
    mockTaskFindByPk.mockResolvedValue(task({ story_id: null }));
    await expect(completeSelfDirectedTask(ENROLLMENT, TASK_ID)).rejects.toMatchObject({ status: 409 });
    expect(mockAward).not.toHaveBeenCalled();
  });
});

describe('ownership', () => {
  it('reads as "not found" for a task on somebody else\'s project — never "forbidden"', async () => {
    mockProjectFindByPk.mockResolvedValue({ id: PROJECT_ID, enrollment_id: 'someone-else' });
    expect(await completeSelfDirectedTask(ENROLLMENT, TASK_ID)).toBeNull();
    expect(mockTaskUpdate).not.toHaveBeenCalled();
    expect(mockAward).not.toHaveBeenCalled();
  });

  it('is null for a task that does not exist, and for one whose project is gone', async () => {
    mockTaskFindByPk.mockResolvedValue(null);
    expect(await completeSelfDirectedTask(ENROLLMENT, TASK_ID)).toBeNull();
    mockTaskFindByPk.mockResolvedValue(task());
    mockProjectFindByPk.mockResolvedValue(null);
    expect(await completeSelfDirectedTask(ENROLLMENT, TASK_ID)).toBeNull();
  });

  it('is scoped by the task\'s OWN project, not the active-project pointer — a rehearsal on any owned build counts', async () => {
    // No call to getProjectByEnrollment; ownership comes from task → project.
    const { getProjectByEnrollment } = jest.requireMock('../../projectService');
    await completeSelfDirectedTask(ENROLLMENT, TASK_ID);
    expect(getProjectByEnrollment).not.toHaveBeenCalled();
    expect(mockProjectFindByPk).toHaveBeenCalledWith(PROJECT_ID);
  });
});

describe('idempotency', () => {
  it('a replay reports already:true, pays 0, and never moves the timestamp', async () => {
    const stamped = new Date('2026-09-14T15:00:00Z');
    mockTaskFindByPk.mockResolvedValue(task({ verified_at: stamped, verified_by: SELF_DIRECTED_SOURCE }));
    mockTaskFindOne.mockResolvedValue(task({ verified_at: stamped, verified_by: SELF_DIRECTED_SOURCE }));
    mockAward.mockResolvedValue({ awarded: false, points: 0 });   // findOrCreate found the row
    const r = await completeSelfDirectedTask(ENROLLMENT, TASK_ID);
    expect(r).toMatchObject({ already: true, points_awarded: 0, status: 'complete' });
    // First-write-wins: the update carries the ORIGINAL stamp back, not now.
    expect(mockTaskUpdate).toHaveBeenCalledWith(expect.objectContaining({ verified_at: stamped }), expect.anything());
  });
});

describe('the kill switch', () => {
  it('still records the completion when awards are off, but pays nothing and never calls award', async () => {
    envState.portalPointsAwardEnabled = false;
    const r = await completeSelfDirectedTask(ENROLLMENT, TASK_ID);
    expect(r).toMatchObject({ status: 'complete', points_awarded: 0 });
    expect(mockTaskUpdate).toHaveBeenCalledTimes(1);
    expect(mockAward).not.toHaveBeenCalled();
  });
});
