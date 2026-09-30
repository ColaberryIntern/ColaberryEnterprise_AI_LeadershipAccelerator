/**
 * The intake becomes truth on the REAL path.
 *
 * On 2026-09-11 every consumer of `project_understandings` for a student
 * project - the confirmation gate, the plan's truth revision, Story 000's own
 * section, the case-study hypothesis - was found to be correct in isolation
 * and unreachable in practice, because nothing on the wizard path wrote the
 * row they read. `saveIntakeTruth` had no caller outside its own tests.
 *
 * This file exists so that cannot happen again silently. It asserts the ONE
 * write, from `startBuild`, with the fields the frontend now carries.
 */
const mockSaveIntake = jest.fn();
const mockGetIntake = jest.fn();
const mockSaveTruth = jest.fn();

jest.mock('../planStore', () => ({
  saveIntake: (...a: any[]) => mockSaveIntake(...a),
  getIntake: (...a: any[]) => mockGetIntake(...a),
  savePlanDraft: jest.fn(),
  getPlan: jest.fn(),
  publishPlan: jest.fn(),
}));
jest.mock('../intakeTruthStore', () => ({
  saveIntakeTruth: (...a: any[]) => mockSaveTruth(...a),
  loadIntakeTruthAtRevision: async () => null,
}));
// Generation runs on the queue after startBuild returns; none of it is under
// test here, and every dependency it reaches for is stubbed inert.
jest.mock('../decomposeService', () => ({ decomposeBuild: jest.fn(async () => { throw new Error('not under test'); }) }));
jest.mock('../repoWriter', () => ({ writeDocsToRepo: jest.fn(), readRepoManifest: async () => null }));
jest.mock('../buildProgressSnapshot', () => ({ loadBuildProgress: async () => ({ progress: [], baselineByStory: {} }) }));
jest.mock('../materializeTasks', () => ({ materializePlanAsTasks: jest.fn() }));
jest.mock('../workspaceRepo', () => ({ repoForProject: async () => null }));
jest.mock('../repoWriteAccess', () => ({ repoWriteAccessForProject: async () => 'push' }));
jest.mock('../projectNaming', () => ({ nameProjectFromIntake: async () => undefined }));
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn(async () => []) } }));

import { startBuild } from '../sbpOrchestrator';

const PROJECT = '11111111-1111-1111-1111-111111111111';

const INPUT = {
  projectId: PROJECT,
  enrollmentId: '22222222-2222-2222-2222-222222222222',
  idea: 'A tool that checks incoming invoices against purchase orders in our spreadsheet.',
  answers: [{
    id: 'guardrail',
    question: 'What would you want to check before it went out?',
    answer: 'Priya signs off anything over 5k.',
    angle: 'THE GUARDRAIL',
  }],
  covered: [{ angle: 'THE TOOLS', evidence: 'our spreadsheet' }],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockGetIntake.mockResolvedValue(null);
  mockSaveIntake.mockResolvedValue(undefined);
  mockSaveTruth.mockResolvedValue({ outcome: 'created', revision: 1, items: [], unmapped: 0 });
});

describe('startBuild writes the truth', () => {
  it('calls saveIntakeTruth once, with the idea, the answers and their angles, and covered', async () => {
    await startBuild(INPUT as any);

    expect(mockSaveTruth).toHaveBeenCalledTimes(1);
    expect(mockSaveTruth).toHaveBeenCalledWith({
      projectId: PROJECT,
      idea: INPUT.idea,
      answers: INPUT.answers,
      covered: INPUT.covered,
    });
  });

  it('carries the angle on each answer, not only the text', async () => {
    // Without the angle the store cannot file the answer and reports it
    // unmapped - which is what happened to every answer before this existed.
    await startBuild(INPUT as any);
    const [call] = mockSaveTruth.mock.calls[0];
    expect(call.answers[0].angle).toBe('THE GUARDRAIL');
  });

  it('writes after the intake is durable, so a build that starts has truth behind it', async () => {
    const order: string[] = [];
    mockSaveIntake.mockImplementation(async () => { order.push('intake'); });
    mockSaveTruth.mockImplementation(async () => { order.push('truth'); return { outcome: 'created', revision: 1, items: [], unmapped: 0 }; });

    await startBuild(INPUT as any);
    expect(order.indexOf('intake')).toBeLessThan(order.indexOf('truth'));
  });

  it('still starts the build when the truth write throws', async () => {
    // A student whose truth could not be recorded still gets their plan. They
    // lose the review screen, not the pipeline.
    mockSaveTruth.mockRejectedValue(new Error('database away'));

    const result = await startBuild(INPUT as any);
    expect(result.status).toBe('generating');
    expect(mockSaveIntake).toHaveBeenCalled();
  });

  it('does not write truth for a build that is already generating', async () => {
    // Idempotent on the project: a double submit must not write a second time
    // any more than it starts a second generation.
    mockGetIntake.mockResolvedValue({ status: 'generating' });
    await startBuild(INPUT as any);
    expect(mockSaveTruth).not.toHaveBeenCalled();
  });

  it('tolerates a bundle cached before angles and covered existed', async () => {
    await startBuild({ ...INPUT, answers: [{ id: 'q', question: 'Q?', answer: 'A.' }], covered: undefined } as any);
    expect(mockSaveTruth).toHaveBeenCalledWith(expect.objectContaining({ covered: undefined }));
  });
});
