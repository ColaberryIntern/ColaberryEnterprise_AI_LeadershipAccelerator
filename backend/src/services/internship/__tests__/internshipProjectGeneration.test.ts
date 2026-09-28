/**
 * The admin door onto the Student Build Pipeline.
 *
 * Ali, 2026-09-28: "We will never build projects like this, one story at a
 * time... This is where I need to put my idea process in here."
 *
 * What these defend is the difference between *calling* the pipeline and
 * *reimplementing* it. Every stage belongs to SBP; this module supplies an
 * enrollment and a review hold. So the tests assert the handoffs — that the
 * intern's own enrollment is what gets built for, that the plan is held rather
 * than published, that the reviewed hash travels to publish — and never
 * re-test decomposition, the gate or materialisation, which have their own
 * suites.
 */
const mockStartBuild = jest.fn();
const mockGetBuildState = jest.fn();
const mockPublishBuild = jest.fn();
const mockQuestions = jest.fn();
const mockCreateProject = jest.fn();
const mockHasPublished = jest.fn();
const mockRepoFor = jest.fn();
const mockApplication = { findByPk: jest.fn() };
const mockProject = { findByPk: jest.fn(), findOne: jest.fn() };

jest.mock('../../sbp/sbpOrchestrator', () => ({
  startBuild: (...a: unknown[]) => mockStartBuild(...a),
  getBuildState: (...a: unknown[]) => mockGetBuildState(...a),
  publishBuild: (...a: unknown[]) => mockPublishBuild(...a),
}));
jest.mock('../../sbp/intakeQuestionsService', () => ({
  generateIntakeQuestions: (...a: unknown[]) => mockQuestions(...a),
}));
jest.mock('../../projectService', () => ({
  createNewProjectForEnrollment: (...a: unknown[]) => mockCreateProject(...a),
}));
jest.mock('../../projects/projectWriteService', () => ({
  hasPublishedBuild: (...a: unknown[]) => mockHasPublished(...a),
}));
jest.mock('../../sbp/workspaceRepo', () => ({ repoForProject: (...a: unknown[]) => mockRepoFor(...a) }));
jest.mock('../../../models/InternshipApplication', () => ({ __esModule: true, default: mockApplication }));
jest.mock('../../../models/Project', () => ({ __esModule: true, default: mockProject }));

import {
  internProjectQuestions, startInternProjectBuild, internProjectBuild,
  assignGeneratedProject, assertNotGeneratedProject, normalizeSize,
} from '../internshipProjectGeneration';

const APP = 'app-1';
const ENROLLMENT = 'enr-1';
const PROJECT = 'proj-1';
const IDEA = 'A tool that tracks local listing velocity so an agent knows which street is moving.';

const project = (over: Record<string, unknown> = {}) => ({
  id: PROJECT, enrollment_id: ENROLLMENT, update: jest.fn(), ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockApplication.findByPk.mockResolvedValue({ id: APP, enrollment_id: ENROLLMENT });
  mockCreateProject.mockResolvedValue(project());
  mockProject.findByPk.mockResolvedValue(project());
  mockStartBuild.mockResolvedValue({ projectId: PROJECT, correlationId: 'corr-1', status: 'generating' });
  mockQuestions.mockResolvedValue({ questions: [{ id: 'q1' }], covered: [], generated: true, model: 'gpt-4o', attempts: 1 });
  mockHasPublished.mockResolvedValue(false);
  mockRepoFor.mockResolvedValue(null);
});

describe('the tier', () => {
  it('takes the three the pipeline knows and falls back to project', () => {
    expect(normalizeSize('workflow')).toBe('workflow');
    expect(normalizeSize('autonomous')).toBe('autonomous');
    expect(normalizeSize('enormous')).toBe('project');
    expect(normalizeSize(null)).toBe('project');
  });
});

describe('the sharpening interview', () => {
  it('runs the question generator the pipeline already owns', async () => {
    await internProjectQuestions({ idea: IDEA, size: 'autonomous' });
    expect(mockQuestions).toHaveBeenCalledWith(expect.objectContaining({ idea: IDEA, size: 'autonomous' }));
  });

  it('refuses an idea too thin to interview against, before spending a model call', async () => {
    await expect(internProjectQuestions({ idea: 'a dashboard' })).rejects.toThrow(/at least 20 characters/);
    expect(mockQuestions).not.toHaveBeenCalled();
  });

  it('reports a degraded interview rather than hiding it', async () => {
    // generated:false means the generic set was substituted and the plan will be
    // measurably worse. Whoever is about to assign it should know.
    mockQuestions.mockResolvedValue({ questions: [], covered: [], generated: false, model: null, attempts: 3 });
    expect((await internProjectQuestions({ idea: IDEA })).generated).toBe(false);
  });
});

describe('starting a generation for an intern', () => {
  it('builds for the INTERN enrollment, resolved from their application', async () => {
    // The whole reason this module exists: SBP takes the enrollment from the
    // participant's own JWT, so a reviewer could never run it for someone else.
    const res = await startInternProjectBuild({ applicationId: APP, idea: IDEA });
    expect(mockApplication.findByPk).toHaveBeenCalledWith(APP, expect.anything());
    expect(mockStartBuild).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT, enrollmentId: ENROLLMENT, idea: IDEA,
    }));
    expect(res).toEqual(expect.objectContaining({ project_id: PROJECT, enrollment_id: ENROLLMENT }));
  });

  it('HOLDS it for review, so the intern cannot see it before the reviewer does', async () => {
    await startInternProjectBuild({ applicationId: APP, idea: IDEA });
    expect(mockStartBuild).toHaveBeenCalledWith(expect.objectContaining({ holdForReview: true }));
  });

  it('carries the interview answers into the brief', async () => {
    const answers = [{ id: 'q1', question: 'Who uses it?', answer: 'Listing agents.' }];
    await startInternProjectBuild({ applicationId: APP, idea: IDEA, answers });
    expect(mockStartBuild).toHaveBeenCalledWith(expect.objectContaining({ answers }));
  });

  it('names the project when a name was given', async () => {
    const p = project();
    mockCreateProject.mockResolvedValue(p);
    await startInternProjectBuild({ applicationId: APP, idea: IDEA, name: 'PropertyPulse AI', industry: 'Real estate' });
    expect(p.update).toHaveBeenCalledWith({ name: 'PropertyPulse AI', industry: 'Real estate' });
  });

  it('does not write an empty name over the one the pipeline will derive', async () => {
    const p = project();
    mockCreateProject.mockResolvedValue(p);
    await startInternProjectBuild({ applicationId: APP, idea: IDEA, name: '  ', industry: null });
    expect(p.update).not.toHaveBeenCalled();
  });

  it('404s an application that does not exist, before creating anything', async () => {
    mockApplication.findByPk.mockResolvedValue(null);
    await expect(startInternProjectBuild({ applicationId: 'nope', idea: IDEA })).rejects.toMatchObject({ status: 404 });
    expect(mockCreateProject).not.toHaveBeenCalled();
    expect(mockStartBuild).not.toHaveBeenCalled();
  });

  it('refuses a too-thin idea before creating a project', async () => {
    await expect(startInternProjectBuild({ applicationId: APP, idea: 'do stuff' })).rejects.toThrow(/at least 20/);
    expect(mockCreateProject).not.toHaveBeenCalled();
  });
});

describe('what the reviewer is shown', () => {
  const violations = [
    { rule: 'must_uncovered', message: 'REQ-002 is fulfilled by no story.', subject: 'REQ-002' },
    { rule: 'story_redundant', message: 'STORY-004 restates STORY-003.', subject: 'STORY-004' },
  ];

  it('splits blocking from advisory on the SERVER', async () => {
    // The student client used to show the first three of a mostly-advisory
    // array as the refusal reason, so someone blocked on an uncovered must-have
    // was told about a stylistically redundant story.
    mockGetBuildState.mockResolvedValue({
      status: 'gate_failed', plan: null, gate: { ok: false, violations },
    });
    const view = await internProjectBuild(PROJECT);
    expect(view.blocking.map((v) => v.rule)).toEqual(['must_uncovered']);
    expect(view.advisory.map((v) => v.rule)).toEqual(['story_redundant']);
  });

  it('hands back the STORED plan hash, the one publish will compare against', async () => {
    mockGetBuildState.mockResolvedValue({
      status: 'drafted',
      plan: { plan: { project_name: 'PropertyPulse AI' }, plan_sha256: 'a'.repeat(64), version: 2 },
      gate: { ok: true, violations: [] },
    });
    const view = await internProjectBuild(PROJECT);
    expect(view.plan_sha256).toBe('a'.repeat(64));
    expect(view.version).toBe(2);
    expect(view.plan).toEqual({ project_name: 'PropertyPulse AI' });
  });

  it('says whether it has already been assigned', async () => {
    mockGetBuildState.mockResolvedValue({ status: 'published', plan: null, gate: null });
    mockHasPublished.mockResolvedValue(true);
    expect((await internProjectBuild(PROJECT)).assigned).toBe(true);
  });

  it('survives a project with no build at all', async () => {
    mockGetBuildState.mockResolvedValue(null);
    const view = await internProjectBuild(PROJECT);
    expect(view).toEqual(expect.objectContaining({ status: null, plan: null, blocking: [], advisory: [] }));
  });
});

describe('assigning the reviewed plan', () => {
  it('publishes with the hash the reviewer read', async () => {
    const sha = 'b'.repeat(64);
    mockPublishBuild.mockResolvedValue({ status: 'awaiting_repo', planVersion: 1 });
    await assignGeneratedProject({ projectId: PROJECT, expectedSha: sha });
    expect(mockPublishBuild).toHaveBeenCalledWith(PROJECT, expect.objectContaining({
      enrollmentId: ENROLLMENT, expectedSha: sha,
    }));
  });

  it('404s a project that does not exist rather than publishing nothing', async () => {
    mockProject.findByPk.mockResolvedValue(null);
    await expect(assignGeneratedProject({ projectId: 'nope' })).rejects.toMatchObject({ status: 404 });
    expect(mockPublishBuild).not.toHaveBeenCalled();
  });
});

describe('the manual form stays an escape hatch', () => {
  it('refuses hand-authoring over a generated project', async () => {
    // importProject writes NOTHING to a project with a published plan and
    // returns the existing tree, so without this the reviewer is told their
    // stories were saved when none were.
    mockProject.findOne.mockResolvedValue({ id: PROJECT });
    mockHasPublished.mockResolvedValue(true);
    await expect(assertNotGeneratedProject(ENROLLMENT)).rejects.toMatchObject({ status: 409 });
  });

  it('allows it when the pipeline has not touched the project', async () => {
    mockProject.findOne.mockResolvedValue({ id: PROJECT });
    mockHasPublished.mockResolvedValue(false);
    await expect(assertNotGeneratedProject(ENROLLMENT)).resolves.toBeUndefined();
  });

  it('allows it when there is no project yet', async () => {
    mockProject.findOne.mockResolvedValue(null);
    await expect(assertNotGeneratedProject(ENROLLMENT)).resolves.toBeUndefined();
    expect(mockHasPublished).not.toHaveBeenCalled();
  });
});
