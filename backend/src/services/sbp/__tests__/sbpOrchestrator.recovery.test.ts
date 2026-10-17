/**
 * Builds stranded by a restart are resumed at boot, not left looking alive.
 *
 * The defect: generation runs on an in-process queue and `generating` is a database row.
 * Kill the process - every deploy does - and the row outlives the queue. `startBuild`
 * refuses a `generating` row, so nothing could ever recover it. This proves the sweep
 * finds those rows, re-enqueues generation from the intake on file, skips what already
 * ran (truth, naming), and marks the unrecoverable ones failed with a reason.
 */

const mockListByStatus = jest.fn();
const mockGetIntake = jest.fn();
const mockSaveIntake = jest.fn();
const mockSaveTruth = jest.fn();
const mockDecompose = jest.fn();
const mockQueueRun = jest.fn();
const mockNameProject = jest.fn();
const mockClaimStale = jest.fn();

jest.mock('../planStore', () => ({
  claimStaleGeneratingIntake: (...a: any[]) => mockClaimStale(...a),
  saveIntake: (...a: any[]) => mockSaveIntake(...a),
  getIntake: (...a: any[]) => mockGetIntake(...a),
  listIntakesByStatus: (...a: any[]) => mockListByStatus(...a),
  savePlanDraft: jest.fn(),
  getPlan: jest.fn(),
  publishPlan: jest.fn(),
}));
jest.mock('../intakeTruthStore', () => ({
  saveIntakeTruth: (...a: any[]) => mockSaveTruth(...a),
  loadIntakeTruthAtRevision: async () => null,
}));
jest.mock('../boundedQueue', () => ({
  getProvisionQueue: () => ({ run: (...a: any[]) => mockQueueRun(...a) }),
}));
jest.mock('../decomposeService', () => ({ decomposeBuild: (...a: any[]) => mockDecompose(...a) }));
jest.mock('../repoWriter', () => ({ writeDocsToRepo: jest.fn(), readRepoManifest: async () => null }));
jest.mock('../buildProgressSnapshot', () => ({ loadBuildProgress: async () => ({ progress: [], baselineByStory: {} }) }));
jest.mock('../materializeTasks', () => ({ materializePlanAsTasks: jest.fn() }));
jest.mock('../workspaceRepo', () => ({ repoForProject: async () => null }));
jest.mock('../repoWriteAccess', () => ({ repoWriteAccessForProject: async () => 'push' }));
jest.mock('../projectNaming', () => ({ nameProjectFromIntake: (...a: any[]) => mockNameProject(...a) }));
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn(async () => []) } }));
// A failed generation emails an alert; the brief test below fails generation on purpose.
jest.mock('../../alertService', () => ({ emitAlert: jest.fn(async () => undefined) }));

import { recoverStrandedBuilds, startBuild, STALE_GENERATION_SECONDS } from '../sbpOrchestrator';

const stranded = (over: Record<string, unknown> = {}) => ({
  project_id: 'proj-1',
  enrollment_id: 'enr-1',
  idea: 'A tool loan system for a repair cafe, replacing the paper sign-out sheet.',
  name: 'Tool Loans',
  size: 'project',
  target_weeks: 8,
  answers: [{ id: 'q1', question: 'Who runs the desk?', answer: 'Marta, on Saturdays.' }],
  correlation_id: 'old-corr',
  status: 'generating',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockQueueRun.mockImplementation(async () => undefined);
  // Default: the row is NOT stale, so nothing is reclaimed and the refusal below is the
  // ordinary path. Only the stale test opts into a successful claim.
  mockClaimStale.mockResolvedValue(false);
  mockSaveIntake.mockResolvedValue({ project_id: 'proj-1', status: 'generating' });
  mockSaveTruth.mockResolvedValue({ outcome: 'saved', revision: 1, items: [], unmapped: 0 });
});

afterEach(() => {
  (console.log as jest.Mock).mockRestore?.();
});

describe('recoverStrandedBuilds', () => {
  it('re-enqueues generation for every row left at generating, from the intake on file', async () => {
    mockListByStatus.mockResolvedValue([stranded(), stranded({ project_id: 'proj-2', enrollment_id: 'enr-2' })]);

    const out = await recoverStrandedBuilds();

    expect(mockListByStatus).toHaveBeenCalledWith('generating');
    expect(out).toEqual({ resumed: ['proj-1', 'proj-2'], abandoned: [] });
    expect(mockQueueRun).toHaveBeenCalledTimes(2);
    expect(mockQueueRun.mock.calls.map((c) => c[1])).toEqual(['generate:proj-1', 'generate:proj-2']);
  });

  it('runs the real generation with the intake\'s idea and answers - not an empty brief', async () => {
    mockListByStatus.mockResolvedValue([stranded()]);
    mockDecompose.mockRejectedValue(new Error('stop here - the brief is what is under test'));

    await recoverStrandedBuilds();
    // Run what was queued, the way the queue would.
    await mockQueueRun.mock.calls[0][0]();

    expect(mockDecompose).toHaveBeenCalledTimes(1);
    const { brief } = mockDecompose.mock.calls[0][0];
    expect(brief).toContain('repair cafe');
    expect(brief).toContain('Marta, on Saturdays.');
  });

  // The resumed build's publish behaviour is held in sbpOrchestrator.autoPublish.test.ts,
  // which has the harness that can tell a publish from a draft.
  it('writes the hold DOWN when a build starts, not only into the running job', async () => {
    // The row is the only thing that outlives the process, so this is the write that makes
    // the test above possible at all.
    mockGetIntake.mockResolvedValue(null);
    mockDecompose.mockRejectedValue(new Error('stop here'));

    await startBuild({
      projectId: 'proj-held', enrollmentId: 'enr-1',
      idea: 'A tool loan system for a repair cafe, replacing the paper sign-out sheet.',
      holdForReview: true,
    });

    const saved = mockSaveIntake.mock.calls.map((c) => c[0]).find((i) => i.project_id === 'proj-held');
    expect(saved).toBeDefined();
    expect(saved.hold_for_review).toBe(true);
  });

  it('does not claim a hold that was never asked for', async () => {
    // The honesty runs both ways: a student's own build must not start resting at drafted.
    mockGetIntake.mockResolvedValue(null);
    mockDecompose.mockRejectedValue(new Error('stop here'));

    await startBuild({
      projectId: 'proj-open', enrollmentId: 'enr-1',
      idea: 'A tool loan system for a repair cafe, replacing the paper sign-out sheet.',
    });

    const saved = mockSaveIntake.mock.calls.map((c) => c[0]).find((i) => i.project_id === 'proj-open');
    expect(saved.hold_for_review).toBe(false);
  });

  it('does not redo what the first start already did - truth and naming', async () => {
    mockListByStatus.mockResolvedValue([stranded()]);
    await recoverStrandedBuilds();
    expect(mockSaveTruth).not.toHaveBeenCalled();
    expect(mockNameProject).not.toHaveBeenCalled();
    // And does not rewrite the intake row before generation either.
    expect(mockSaveIntake).not.toHaveBeenCalled();
  });

  it('marks a row with no enrolment failed with a reason, so it stops looking alive', async () => {
    mockListByStatus.mockResolvedValue([stranded({ enrollment_id: null })]);
    mockGetIntake.mockResolvedValue(stranded({ enrollment_id: null }));

    const out = await recoverStrandedBuilds();

    expect(out).toEqual({ resumed: [], abandoned: ['proj-1'] });
    expect(mockQueueRun).not.toHaveBeenCalled();
    expect(mockSaveIntake).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'proj-1',
      status: 'failed',
      last_error: expect.objectContaining({ error_class: 'StrandedWithoutEnrollment' }),
    }));
  });

  it('is a no-op on a clean boot', async () => {
    mockListByStatus.mockResolvedValue([]);
    const out = await recoverStrandedBuilds();
    expect(out).toEqual({ resumed: [], abandoned: [] });
    expect(mockQueueRun).not.toHaveBeenCalled();
    expect(mockSaveIntake).not.toHaveBeenCalled();
  });

  it('a queue that refuses one build does not stop the sweep', async () => {
    mockListByStatus.mockResolvedValue([stranded(), stranded({ project_id: 'proj-2' })]);
    mockQueueRun.mockImplementationOnce(async () => { throw Object.assign(new Error('full'), { error_class: 'QueueFull' }); });

    const out = await recoverStrandedBuilds();
    // The rejection is caught on the promise; the sweep still lists both as resumed
    // because the hand-off happened. The failure is one classified log line.
    expect(out.resumed).toEqual(['proj-1', 'proj-2']);
    await new Promise((r) => setImmediate(r));
  });
});

/**
 * P7-T3 CASE 1, the acceptance clause the rest of the packet satisfies and this one did not:
 * **every recovery emits a VISIBLE RETRY REASON**.
 *
 * `recoverStrandedBuilds` logs `sbp_build_resumed_after_restart` with the correlation id of
 * the run it is resuming, which is the only thread tying the resumed generation back to the
 * one the restart interrupted. Before this test, `grep -rn "sbp_build_resumed_after_restart"
 * src` returned ONE production line and no test -- the reason was emitted and nothing checked
 * it, so a refactor could drop the correlation id, or the whole line, in silence.
 */
describe('case 1: the resume emits a visible, traceable retry reason', () => {
  it('logs sbp_build_resumed_after_restart carrying the INTERRUPTED run id', async () => {
    const logs: string[] = [];
    (console.log as jest.Mock).mockImplementation((line: string) => { logs.push(String(line)); });
    mockListByStatus.mockResolvedValue([stranded()]);

    await recoverStrandedBuilds();

    const entry = logs
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .find((e) => e?.event === 'sbp_build_resumed_after_restart');

    expect(entry).toBeDefined();
    // `partial` rather than `success`: the build is not finished, it is being picked up again.
    expect(entry.outcome).toBe('partial');
    expect(entry.context.projectId).toBe('proj-1');
    // THE TRACEABLE HALF. Without the previous correlation id the resumed run is a new event
    // with no link to the interrupted one, and nobody can follow a build across the restart.
    expect(entry.context).toHaveProperty('previous_correlation_id');
    expect(entry.context.previous_correlation_id).toBe(stranded().correlation_id);
    // And the resume carries its OWN correlation id, distinct from the one it is resuming.
    expect(entry.correlation_id).toBeTruthy();
    expect(entry.correlation_id).not.toBe(entry.context.previous_correlation_id);
  });
});

describe('the defect this closes', () => {
  it('startBuild still refuses a generating row that is NOT stale - the sweep, not a retry, is the recovery', async () => {
    mockGetIntake.mockResolvedValue(stranded());
    const res = await startBuild({ projectId: 'proj-1', enrollmentId: 'enr-1', idea: 'x'.repeat(40) });
    expect(res.status).toBe('generating');
    expect(mockQueueRun).not.toHaveBeenCalled();
    expect(mockSaveIntake).not.toHaveBeenCalled();
  });
});

/**
 * The second half of the same defect. The sweep recovers a row the RESTART stranded, because a
 * restart is what runs it. A generation that dies while the process lives strands a row the
 * sweep will not see again until the next boot — so the student's retry was refused until
 * somebody deployed.
 */
describe('a generation that died without the process dying', () => {
  it('RECLAIMS a generating row once it has been idle past the threshold, and generates', async () => {
    mockGetIntake.mockResolvedValue(stranded());
    mockClaimStale.mockResolvedValue(true);

    const res = await startBuild({ projectId: 'proj-1', enrollmentId: 'enr-1', idea: 'x'.repeat(40) });

    // `status` is NOT the discriminator: a reclaimed build is generating again, so both paths
    // answer 'generating'. What separates them is whether the work actually restarted.
    expect(mockSaveIntake).toHaveBeenCalled();
    expect(mockQueueRun).toHaveBeenCalled();
    // And it runs under a NEW correlation id, so the dead run's logs stay distinguishable from
    // the live one's.
    expect(res.correlationId).not.toBe('old-corr');
  });

  it('asks for the claim with the project and the MEASURED threshold, not an invented one', async () => {
    mockGetIntake.mockResolvedValue(stranded());
    mockClaimStale.mockResolvedValue(false);

    await startBuild({ projectId: 'proj-1', enrollmentId: 'enr-1', idea: 'x'.repeat(40) });

    expect(mockClaimStale).toHaveBeenCalledWith('proj-1', expect.any(String), STALE_GENERATION_SECONDS);
    // An hour is far above the measured p90 of 57.3s. If this constant is ever lowered towards
    // the time a real generation takes, a healthy build gets taken over mid-flight.
    expect(STALE_GENERATION_SECONDS).toBeGreaterThanOrEqual(600);
  });

  it('does NOT reclaim when the claim is refused, so a live build is never taken over', async () => {
    // The negative control. Without it, a change that reclaimed unconditionally would pass the
    // test above and break every concurrent start.
    mockGetIntake.mockResolvedValue(stranded());
    mockClaimStale.mockResolvedValue(false);

    const res = await startBuild({ projectId: 'proj-1', enrollmentId: 'enr-1', idea: 'x'.repeat(40) });

    expect(res.status).toBe('generating');
    expect(mockQueueRun).not.toHaveBeenCalled();
    expect(mockSaveIntake).not.toHaveBeenCalled();
  });

  it('never consults the claim for a row that is not generating', async () => {
    mockGetIntake.mockResolvedValue({ ...stranded(), status: 'failed' });
    await startBuild({ projectId: 'proj-1', enrollmentId: 'enr-1', idea: 'x'.repeat(40) });
    expect(mockClaimStale).not.toHaveBeenCalled();
  });
});
