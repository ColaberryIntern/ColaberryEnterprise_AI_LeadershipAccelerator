/**
 * The intake -> project name hand-off, which did not exist.
 *
 * `startBuild` wrote the student's chosen name into `build_intake.name` and
 * that was the end of it. `buildBriefText` — the function that assembles
 * everything the decomposer is told — enumerates idea, answers, users, data
 * sources, done definition and schedule, and never mentions `name`. No other
 * reader existed either, and no code path in the entire backend wrote
 * `projects.name`. So every student build was born NULL-named and the portal
 * rendered the literal "Your build" for all 20 of them.
 *
 * These tests hold the hand-off at both ends: the moment the name is first
 * knowable (intake), and the last moment it can be recovered (publish).
 */
const mockDecompose = jest.fn();
const mockSaveIntake = jest.fn();
const mockGetIntake = jest.fn();
const mockGetPlan = jest.fn();
const mockPublishPlan = jest.fn();
const mockMaterialize = jest.fn();
const mockSetProjectName = jest.fn();
const mockSequelizeQuery = jest.fn();

jest.mock('../decomposeService', () => ({ decomposeBuild: (...a: any[]) => mockDecompose(...a) }));
jest.mock('../planStore', () => ({
  saveIntake: (...a: any[]) => mockSaveIntake(...a),
  getIntake: (...a: any[]) => mockGetIntake(...a),
  savePlanDraft: jest.fn(),
  getPlan: (...a: any[]) => mockGetPlan(...a),
  publishPlan: (...a: any[]) => mockPublishPlan(...a),
}));
jest.mock('../materializeTasks', () => ({ materializePlanAsTasks: (...a: any[]) => mockMaterialize(...a) }));
jest.mock('../scheduleForEnrollment', () => ({ scheduleForEnrollment: async () => ({ weeks: [] }) }));
jest.mock('../projectNaming', () => ({ setProjectNameIfEmpty: (...a: any[]) => mockSetProjectName(...a) }));
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: any[]) => mockSequelizeQuery(...a) },
}));

import { startBuild, publishBuild } from '../sbpOrchestrator';
import { BuildPlan } from '../planContract';

const PROJECT = '11111111-1111-1111-1111-111111111111';
const ENROLLMENT = '22222222-2222-2222-2222-222222222222';

const plan: BuildPlan = {
  project_name: 'AI SAT Study Agent',
  descriptor: 'SAT preparation coach',
  requirements: [],
  releases: [],
  stories: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIntake.mockResolvedValue(null);
  mockSaveIntake.mockResolvedValue(undefined);
  mockSetProjectName.mockResolvedValue(true);
  mockSequelizeQuery.mockResolvedValue([[], {}]);
  // Generation is irrelevant to naming and runs on the queue; make it a no-op
  // that resolves so the suite never waits on a model call.
  mockDecompose.mockRejectedValue(new Error('generation not under test'));
});

describe('startBuild names the project from intake', () => {
  it("passes the student's chosen name straight to projects.name", async () => {
    await startBuild({
      projectId: PROJECT, enrollmentId: ENROLLMENT,
      idea: 'A tool that books soccer fields.', name: 'GoalKick',
    });

    expect(mockSetProjectName).toHaveBeenCalledTimes(1);
    expect(mockSetProjectName).toHaveBeenCalledWith(PROJECT, 'GoalKick');
  });

  it('still records the name on the intake row it always did', async () => {
    await startBuild({
      projectId: PROJECT, enrollmentId: ENROLLMENT, idea: 'An idea.', name: 'HomeHub',
    });
    expect(mockSaveIntake).toHaveBeenCalledTimes(1);
    expect(mockSaveIntake.mock.calls[0][0].name).toBe('HomeHub');
  });

  it('hands the naming call an undefined name when the wizard left it blank', async () => {
    // The wizard's name field is optional — 5 of the 20 live builds have no
    // intake name. The call is still made, and setProjectNameIfEmpty is what
    // decides nothing is written; that decision has its own test.
    await startBuild({ projectId: PROJECT, enrollmentId: ENROLLMENT, idea: 'An idea.' });
    expect(mockSetProjectName).toHaveBeenCalledTimes(1);
    expect(mockSetProjectName).toHaveBeenCalledWith(PROJECT, undefined);
  });

  it('does not fail the build when the naming write throws', async () => {
    // Naming is presentation. It must never be able to cost a student a build.
    mockSetProjectName.mockRejectedValue(new Error('column disappeared'));
    await expect(startBuild({
      projectId: PROJECT, enrollmentId: ENROLLMENT, idea: 'An idea.', name: 'MeshMedic',
    })).resolves.toMatchObject({ projectId: PROJECT, status: 'generating' });
  });
});

describe('publishBuild fills the name from the plan', () => {
  beforeEach(() => {
    mockGetPlan.mockResolvedValue({ version: 1, gate_violations: [], plan_sha256: 'sha' });
    mockPublishPlan.mockResolvedValue({
      version: 1, plan: plan, plan_sha256: 'sha', correlation_id: 'cid',
    });
    mockMaterialize.mockResolvedValue({ lists: 1, tasks: 1, preservedComplete: 0 });
  });

  it("uses the plan's project_name when publishing without a repo", async () => {
    const result = await publishBuild(PROJECT, { enrollmentId: ENROLLMENT, repo: null });

    expect(result.status).toBe('awaiting_repo');
    expect(mockSetProjectName).toHaveBeenCalledTimes(1);
    expect(mockSetProjectName).toHaveBeenCalledWith(PROJECT, 'AI SAT Study Agent');
  });

  it('does not fail the publish when the naming write throws', async () => {
    // The plan is already durable by this point. A cosmetic column must not be
    // able to turn a successful publish into a failure the student sees.
    mockSetProjectName.mockRejectedValue(new Error('column disappeared'));
    await expect(publishBuild(PROJECT, { enrollmentId: ENROLLMENT, repo: null }))
      .resolves.toMatchObject({ status: 'awaiting_repo' });
  });
});
