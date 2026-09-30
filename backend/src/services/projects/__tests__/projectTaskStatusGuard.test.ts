/**
 * Task completion is GRANTED, never CLAIMED.
 *
 * The defect these tests pin: `setTaskStatus` and `setTaskStatusByStory` took
 * `status` straight from the request body behind nothing but an ownership
 * check, and `complete` was a legal value. Since a student owns every task in
 * their own project, ownership authorised nothing — any participant could open
 * devtools and PATCH their whole plan to complete. Points are awarded on the
 * strength of completion, so that made the verification chain theatre.
 *
 * These tests are written to be hostile to the fix: they check the refusal
 * fires on BOTH routes' service entry points, that it is loud rather than a
 * silent no-op, that a refused write leaves the stored row untouched, that the
 * import payload cannot mint completion either, and that the server-side
 * verification path CAN still reach `complete` (a guard that blocks everyone
 * is not a fix, it is an outage).
 *
 * Models and sequelize are mocked, matching projectWriteService.test.ts: this
 * is the service's control flow under test, not Postgres.
 */

const mockTransaction = jest.fn();
const mockQuery = jest.fn();
const mockProjectFindByPk = jest.fn();
const mockTaskFindByPk = jest.fn();
const mockTaskFindOne = jest.fn();
const mockTaskUpdate = jest.fn();
const mockTaskFindOrCreate = jest.fn();
const mockTaskCreate = jest.fn();
const mockListFindOrCreate = jest.fn();
const mockGetProjectByEnrollment = jest.fn();
const mockCreateProjectForEnrollment = jest.fn();
const mockGetOwnedProjectTree = jest.fn();

jest.mock('../../../config/database', () => ({
  sequelize: {
    transaction: (...a: any[]) => mockTransaction(...a),
    query: (...a: any[]) => mockQuery(...a),
  },
}));
jest.mock('../../../models/Project', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockProjectFindByPk(...a) },
}));
jest.mock('../../../models/StudentTaskList', () => ({
  __esModule: true,
  default: { findOrCreate: (...a: any[]) => mockListFindOrCreate(...a) },
}));
jest.mock('../../../models/StudentTask', () => ({
  __esModule: true,
  default: {
    findByPk: (...a: any[]) => mockTaskFindByPk(...a),
    findOne: (...a: any[]) => mockTaskFindOne(...a),
    update: (...a: any[]) => mockTaskUpdate(...a),
    findOrCreate: (...a: any[]) => mockTaskFindOrCreate(...a),
    create: (...a: any[]) => mockTaskCreate(...a),
  },
}));
jest.mock('../../projectService', () => ({
  createProjectForEnrollment: (...a: any[]) => mockCreateProjectForEnrollment(...a),
  getProjectByEnrollment: (...a: any[]) => mockGetProjectByEnrollment(...a),
}));
jest.mock('../projectReadService', () => ({
  getOwnedProjectTree: (...a: any[]) => mockGetOwnedProjectTree(...a),
}));

import {
  setTaskStatus,
  setTaskStatusByStory,
  markTaskVerifiedComplete,
  importProject,
} from '../projectWriteService';

const ENROLLMENT = 'enr-1';
const PROJECT_ID = 'proj-1';
const TASK_ID = 'task-1';
const STORY_ID = 'STORY-004';

/** The three a student may set freely — their own planning, worth no points. */
const PLANNING_STATUSES = ['not_started', 'in_progress', 'blocked'] as const;

/**
 * Stands in for the persisted row. `update` writes through to it, so a test can
 * assert on what the DATABASE would hold rather than only on call counts — a
 * guard that skips the update but corrupts the row some other way still fails.
 */
let storedStatus: string;

let logLines: any[];

beforeEach(() => {
  jest.clearAllMocks();
  storedStatus = 'in_progress';

  mockTaskFindByPk.mockResolvedValue({ id: TASK_ID, project_id: PROJECT_ID, get status() { return storedStatus; } });
  mockProjectFindByPk.mockResolvedValue({ id: PROJECT_ID, enrollment_id: ENROLLMENT });
  mockGetProjectByEnrollment.mockResolvedValue({ id: PROJECT_ID });
  mockTaskFindOne.mockResolvedValue({ id: TASK_ID, story_id: STORY_ID, verified_at: null, verified_by: null });
  mockTaskUpdate.mockImplementation(async (values: any) => {
    if (values && typeof values.status === 'string') storedStatus = values.status;
    return [1];
  });

  // Structured logs are captured, not printed: the refusal audit line is itself
  // an assertion target (a burst of them is somebody probing the API).
  logLines = [];
  jest.spyOn(console, 'log').mockImplementation((line?: any) => {
    const text = String(line);
    logLines.push(text.startsWith('{') ? JSON.parse(text) : { raw: text });
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('a client cannot set complete — PATCH /tasks/:taskId', () => {
  it('refuses with 409 and explains that completion is granted, not claimed', async () => {
    const err = await setTaskStatus(ENROLLMENT, TASK_ID, 'complete').catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(409);
    // The message has to teach the mechanism; "forbidden" alone would leave the
    // student thinking the feature is broken.
    expect(err.message).toMatch(/verified/i);
    expect(err.message).toMatch(/not set by the client/i);
  });

  it('leaves the stored row exactly as it was', async () => {
    await setTaskStatus(ENROLLMENT, TASK_ID, 'complete').catch(() => undefined);

    expect(mockTaskUpdate).not.toHaveBeenCalled();
    expect(storedStatus).toBe('in_progress');
  });

  it('refuses before it even reads the task, so a refused write cannot half-happen', async () => {
    await setTaskStatus(ENROLLMENT, TASK_ID, 'complete').catch(() => undefined);

    expect(mockTaskFindByPk).not.toHaveBeenCalled();
  });

  it('throws rather than returning quietly — a silent no-op would desync the UI', async () => {
    // If this resolved, the route would answer 200 and the client would render a
    // `complete` the server never stored.
    await expect(setTaskStatus(ENROLLMENT, TASK_ID, 'complete')).rejects.toThrow();
  });

  it('records the attempt as a structured audit line', async () => {
    await setTaskStatus(ENROLLMENT, TASK_ID, 'complete').catch(() => undefined);

    const refusal = logLines.find((l) => l.event === 'task_status_client_complete_refused');
    expect(refusal).toBeDefined();
    expect(refusal.outcome).toBe('failure');
    expect(refusal.context).toMatchObject({ enrollmentId: ENROLLMENT, taskId: TASK_ID, requested: 'complete' });
  });
});

describe('a client cannot set complete — PATCH /tasks/by-story/:storyId', () => {
  it('refuses with 409 on the story path too', async () => {
    const err = await setTaskStatusByStory(ENROLLMENT, STORY_ID, 'complete').catch((e) => e);

    expect(err.status).toBe(409);
    expect(err.message).toMatch(/verified/i);
  });

  it('leaves the stored row exactly as it was', async () => {
    await setTaskStatusByStory(ENROLLMENT, STORY_ID, 'complete').catch(() => undefined);

    expect(mockTaskUpdate).not.toHaveBeenCalled();
    expect(storedStatus).toBe('in_progress');
  });

  it('does not resolve the project first — the refusal costs no I/O on either route', async () => {
    // Closing one route and leaving the other cheaper-but-open was the obvious
    // half-fix; this pins both to the same guard.
    await setTaskStatusByStory(ENROLLMENT, STORY_ID, 'complete').catch(() => undefined);

    expect(mockGetProjectByEnrollment).not.toHaveBeenCalled();
    expect(mockTaskFindOne).not.toHaveBeenCalled();
  });
});

describe('planning statuses still move freely — the guard is not a lockout', () => {
  it.each(PLANNING_STATUSES)('setTaskStatus writes %s through', async (status) => {
    const result = await setTaskStatus(ENROLLMENT, TASK_ID, status);

    expect(result).toEqual({ id: TASK_ID, status });
    expect(mockTaskUpdate).toHaveBeenCalledWith({ status }, { where: { id: TASK_ID } });
    expect(storedStatus).toBe(status);
  });

  it.each(PLANNING_STATUSES)('setTaskStatusByStory writes %s through', async (status) => {
    const result = await setTaskStatusByStory(ENROLLMENT, STORY_ID, status);

    expect(result).toEqual({ id: TASK_ID, story_id: STORY_ID, status });
    expect(storedStatus).toBe(status);
  });

  it('still refuses a task the student does not own', async () => {
    // Regression guard: the completion check was inserted ahead of the ownership
    // check, and must not have displaced it.
    mockProjectFindByPk.mockResolvedValue({ id: PROJECT_ID, enrollment_id: 'someone-else' });

    expect(await setTaskStatus(ENROLLMENT, TASK_ID, 'in_progress')).toBeNull();
    expect(mockTaskUpdate).not.toHaveBeenCalled();
  });

  it.each(PLANNING_STATUSES)('never stamps verified_at when a client writes %s', async (status) => {
    // student_tasks.verified_at is what points gate on. The model says it must
    // never be written as a side effect of a student updating their own task;
    // this is that sentence turned into a test.
    await setTaskStatus(ENROLLMENT, TASK_ID, status);

    const [values] = mockTaskUpdate.mock.calls[0];
    expect(values).toEqual({ status });
    expect(values).not.toHaveProperty('verified_at');
    expect(values).not.toHaveProperty('verified_by');
  });

  it('answers a malformed status with 400, distinct from the 409 for complete', async () => {
    // The two rejections mean different things — "you sent nonsense" versus
    // "that one is not yours to set" — and a client should be able to tell them
    // apart without parsing prose.
    const err = await setTaskStatus(ENROLLMENT, TASK_ID, 'done-ish').catch((e) => e);

    expect(err.status).toBe(400);
  });
});

describe('markTaskVerifiedComplete — the one legitimate path to complete', () => {
  const EVIDENCE = { source: 'build_pipeline', ref: 'run-778', correlation_id: 'c-1' };

  it('reaches complete, which is the whole point of keeping a server-side door', async () => {
    const result = await markTaskVerifiedComplete(PROJECT_ID, STORY_ID, EVIDENCE);

    expect(result).toMatchObject({ id: TASK_ID, story_id: STORY_ID, status: 'complete' });
    expect(storedStatus).toBe('complete');
  });

  it('stamps verified_at and verified_by — the columns points will gate on', async () => {
    await markTaskVerifiedComplete(PROJECT_ID, STORY_ID, EVIDENCE);

    const [values, options] = mockTaskUpdate.mock.calls[0];
    expect(options).toEqual({ where: { id: TASK_ID } });
    expect(values.status).toBe('complete');
    expect(values.verified_at).toBeInstanceOf(Date);
    expect(values.verified_by).toBe('build_pipeline');
  });

  it('is replay-safe — a second run keeps the FIRST verification timestamp', async () => {
    // A pipeline retry must not move the instant the work was confirmed;
    // anything computing a points window off verified_at would shift with it.
    const firstStamp = new Date('2026-08-01T10:00:00.000Z');
    mockTaskFindOne.mockResolvedValue({
      id: TASK_ID, story_id: STORY_ID, verified_at: firstStamp, verified_by: 'mentor_review',
    });

    const result = await markTaskVerifiedComplete(PROJECT_ID, STORY_ID, EVIDENCE);

    const [values] = mockTaskUpdate.mock.calls[0];
    expect(values.verified_at).toBe(firstStamp);
    expect(values.verified_by).toBe('mentor_review');
    expect(result!.verified_at).toBe(firstStamp);
  });

  it('scopes the lookup to the project it was handed, not to a session', async () => {
    await markTaskVerifiedComplete(PROJECT_ID, STORY_ID, EVIDENCE);

    expect(mockTaskFindOne).toHaveBeenCalledWith({ where: { project_id: PROJECT_ID, story_id: STORY_ID } });
  });

  it('writes an audit line naming what verified the work', async () => {
    await markTaskVerifiedComplete(PROJECT_ID, STORY_ID, EVIDENCE);

    const granted = logLines.find((l) => l.event === 'task_verified_complete');
    expect(granted.outcome).toBe('success');
    expect(granted.context).toMatchObject({ source: 'build_pipeline', ref: 'run-778', correlation_id: 'c-1' });
  });

  it('refuses evidence that names no source', async () => {
    // An untraceable completion is indistinguishable from the client claim this
    // change exists to stop, so the pipeline does not get to skip attribution.
    await expect(markTaskVerifiedComplete(PROJECT_ID, STORY_ID, { source: '  ' })).rejects.toMatchObject({ status: 400 });
    expect(mockTaskUpdate).not.toHaveBeenCalled();
  });

  it('writes nothing when the story is not in that project', async () => {
    // A caller holding a stale plan must not complete somebody else's row.
    mockTaskFindOne.mockResolvedValue(null);

    expect(await markTaskVerifiedComplete(PROJECT_ID, 'STORY-999', EVIDENCE)).toBeNull();
    expect(mockTaskUpdate).not.toHaveBeenCalled();
  });

  it('is not reachable from any HTTP route', async () => {
    // The guard is only worth as much as the absence of a second door. If a
    // future change wires this behind Express, completion becomes claimable
    // again and this test is the thing that says so.
    const fs = require('fs');
    const path = require('path');
    const routesDir = path.join(__dirname, '..', '..', '..', 'routes');
    const offenders = fs.readdirSync(routesDir)
      .filter((f: string) => f.endsWith('.ts'))
      .filter((f: string) => fs.readFileSync(path.join(routesDir, f), 'utf8').includes('markTaskVerifiedComplete'));

    expect(offenders).toEqual([]);
  });
});

describe('the import payload cannot mint completion either', () => {
  beforeEach(() => {
    mockQuery.mockResolvedValue([[], []]);            // no published build
    mockCreateProjectForEnrollment.mockResolvedValue({ id: PROJECT_ID });
    mockGetOwnedProjectTree.mockResolvedValue({ id: PROJECT_ID, lists: [] });
    mockTransaction.mockImplementation(async (cb: any) => cb({ __tx: true }));
    mockListFindOrCreate.mockImplementation(async ({ where }: any) => [{ id: `list-${where.cluster}` }, true]);
  });

  const payloadClaimingComplete = {
    lists: [{ cluster: 'c', tasks: [{ story_id: 's1', title: 't', status: 'complete' }] }],
  };

  it('demotes a client-claimed complete on a new row', async () => {
    // Otherwise a client refused a 409 on PATCH just re-imports itself complete.
    mockTaskFindOrCreate.mockImplementation(async ({ defaults }: any) => [{ ...defaults, update: jest.fn() }, true]);

    await importProject(ENROLLMENT, payloadClaimingComplete as any);

    expect(mockTaskFindOrCreate.mock.calls[0][0].defaults.status).toBe('in_progress');
  });

  it('demotes it on an existing row too', async () => {
    const update = jest.fn();
    mockTaskFindOrCreate.mockImplementation(async ({ defaults }: any) => [
      { ...defaults, status: 'not_started', update }, false,
    ]);

    await importProject(ENROLLMENT, payloadClaimingComplete as any);

    expect(update.mock.calls[0][0].status).toBe('in_progress');
  });

  it('still never regresses a row the platform already verified (FR-014)', async () => {
    // The demotion must not become a way to un-complete verified work.
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
