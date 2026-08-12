/**
 * The Architect, wired into the orchestrator.
 *
 * FR-003 requires the requirements document to be built chapter-by-chapter. The
 * orchestrator shipped without it for weeks and decomposed straight from the
 * brief — which is why a build took 30 seconds rather than the ~15 minutes the
 * pipeline was designed around, and why plans came out thinner than the spec.
 *
 * The behaviours worth pinning are all about what happens when a 15-minute
 * dependency on someone else's server misbehaves.
 */
const mockDecompose = jest.fn();
const mockSaveIntake = jest.fn();
const mockGetIntake = jest.fn();
const mockSaveDraft = jest.fn();
const mockGetPlan = jest.fn();
const mockStartJob = jest.fn();
const mockAwaitDocument = jest.fn();
const mockRepairCreate = jest.fn();

jest.mock('../decomposeService', () => ({ decomposeBuild: (...a: any[]) => mockDecompose(...a) }));
jest.mock('../planStore', () => ({
  saveIntake: (...a: any[]) => mockSaveIntake(...a),
  getIntake: (...a: any[]) => mockGetIntake(...a),
  savePlanDraft: (...a: any[]) => mockSaveDraft(...a),
  getPlan: (...a: any[]) => mockGetPlan(...a),
  publishPlan: jest.fn(),
}));
jest.mock('../repoWriter', () => ({ writeDocsToRepo: jest.fn() }));
jest.mock('../materializeTasks', () => ({ materializePlanAsTasks: jest.fn().mockResolvedValue({ lists: 1, tasks: 1, preservedComplete: 0 }) }));
jest.mock('../architectClient', () => {
  const actual = jest.requireActual('../architectClient');
  return {
    ...actual,
    startJob: (...a: any[]) => mockStartJob(...a),
    awaitDocument: (...a: any[]) => mockAwaitDocument(...a),
  };
});

import { startBuild, buildBriefText } from '../sbpOrchestrator';
import { BuildPlan } from '../planContract';

const PROJECT = '33333333-3333-3333-3333-333333333333';
const ENROLLMENT = '44444444-4444-4444-4444-444444444444';

const plan: BuildPlan = {
  project_name: 'Clinic No-Show Predictor', descriptor: 'clinic scheduling',
  requirements: [{ id: 'REQ-001', statement: 'The front desk sees a daily risk list.', kind: 'FUNC', priority: 'must', cluster: 'Risk' }],
  releases: [{ key: 'r0', name: 'Skeleton', goal: 'g', demo: 'd', week_start: 1, week_end: 2 }],
  stories: [{
    id: 'STORY-001', release: 'r0', title: 'Front desk sees the risk list',
    narrative: 'As front desk staff, I want a risk list, so that I can refill slots.',
    fulfills: ['REQ-001'], owner_agent: 'Risk',
    acceptance: ['Given a, when b, then c.', 'Given d, when e, then f.', 'Trust - the audit log records it.'],
    task_guidance: 'g', failure_paths: ['export unavailable'], blocked_by: [],
  }],
};

const ANSWERS = {
  q1_job: 'Tells the front desk who will miss tomorrow.',
  q2_operator: 'Front desk staff, not technical.',
  q3_trigger: 'A nightly 6pm job.',
  q4_systems: 'Dentrix export, Twilio for SMS.',
  q5_decision: 'Which patients are likely to no-show.',
  q6_never: 'No appointment is cancelled without a human.',
  q7_measure: 'No-show rate 18% to under 12%.',
};

const INPUT = {
  projectId: PROJECT, enrollmentId: ENROLLMENT, name: 'Clinic No-Show Predictor',
  idea: 'A tool for a dental clinic that predicts which patients will miss their appointment and refills the slot from the waitlist.',
  size: 'project', answers: ANSWERS, targetWeeks: 6,
};

/** Statuses written to the intake, in order. */
const statuses = () => mockSaveIntake.mock.calls.map((c) => c[0]?.status).filter(Boolean);
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockGetIntake.mockResolvedValue({ project_id: PROJECT, idea: INPUT.idea, status: 'captured', correlation_id: 'c' });
  mockSaveIntake.mockResolvedValue({ project_id: PROJECT, status: 'generating' });
  mockRepairCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ stories: [], requirements: [], remove_story_ids: [] }) } }] });
  mockDecompose.mockResolvedValue({ plan, attempts: 1, model: 'gpt-4o', client: { create: mockRepairCreate } });
  mockSaveDraft.mockResolvedValue({
    id: 'p', project_id: PROJECT, version: 1, status: 'draft', plan, plan_sha256: 'sha',
    gate_ok: true, gate_violations: [], correlation_id: 'c',
  });
  mockStartJob.mockResolvedValue({ jobId: 'clinic-abc12345', status: 'started', blueprint: 'standard' });
  mockAwaitDocument.mockResolvedValue({ markdown: '# Chapter 1\n' + 'word '.repeat(6000), words: 6001 });
  delete process.env.SBP_USE_ARCHITECT;
});

describe('the flag', () => {
  it('is OFF by default — deploying this changes nothing until it is switched on', async () => {
    await startBuild(INPUT);
    await settle();
    expect(mockStartJob).not.toHaveBeenCalled();
    expect(mockDecompose).toHaveBeenCalledWith(expect.objectContaining({ document: '' }));
  });

  it('runs the Architect when the env flag is on', async () => {
    process.env.SBP_USE_ARCHITECT = 'true';
    await startBuild(INPUT);
    await settle();
    expect(mockStartJob).toHaveBeenCalled();
  });

  it('lets a single build opt in without the env flag', async () => {
    await startBuild({ ...INPUT, useArchitect: true });
    await settle();
    expect(mockStartJob).toHaveBeenCalled();
  });

  it('lets a single build opt OUT even when the env flag is on', async () => {
    process.env.SBP_USE_ARCHITECT = 'true';
    await startBuild({ ...INPUT, useArchitect: false });
    await settle();
    expect(mockStartJob).not.toHaveBeenCalled();
  });
});

describe('what it sends and what it does with the result', () => {
  beforeEach(() => { process.env.SBP_USE_ARCHITECT = 'true'; });

  it('feeds the Architect the assembled brief, not the bare idea', async () => {
    await startBuild(INPUT);
    await settle();
    const sent = mockStartJob.mock.calls[0][0];
    expect(sent.requirements).toContain(ANSWERS.q6_never);
    expect(sent.requirements).toContain('IMPLEMENTATION CONSTRAINTS');
    expect(sent.depthMode).toBe('professional');       // size 'project'
    expect(sent.blueprint).toBe('standard');
  });

  it('gives the job a name that cannot collide with another student', async () => {
    await startBuild(INPUT);
    await settle();
    expect(mockStartJob.mock.calls[0][0].projectName).toContain('33333333');
  });

  it('passes the generated document to the decomposer', async () => {
    await startBuild(INPUT);
    await settle();
    expect(mockDecompose).toHaveBeenCalledWith(
      expect.objectContaining({ document: expect.stringContaining('Chapter 1') }),
    );
  });

  it('shows the student a researching phase before generating', async () => {
    // 15 minutes of silence reads as a hang. The status has to move, and it must
    // be `researching` from the very first write — not `generating` first, which
    // would tell the student we are decomposing while we are actually waiting.
    const result = await startBuild(INPUT);
    expect(result.status).toBe('researching');

    await settle();
    const seq = statuses();
    expect(seq[0]).toBe('researching');
    expect(seq).toContain('generating');
    expect(seq.indexOf('researching')).toBeLessThan(seq.indexOf('generating'));
  });

  it('refuses to start a second run while the Architect phase is in flight', async () => {
    // The guard used to check only `status === 'generating'`. Adding
    // `researching` without widening it would let an impatient re-submit start
    // a SECOND 15-minute job against the same project.
    mockGetIntake.mockResolvedValue({ project_id: PROJECT, idea: INPUT.idea, status: 'researching', correlation_id: 'c' });
    const out = await startBuild(INPUT);
    await settle();

    expect(out.status).toBe('researching');
    expect(mockStartJob).not.toHaveBeenCalled();
    expect(mockDecompose).not.toHaveBeenCalled();
  });

  it('persists the job id BEFORE the wait, so a restart can resume it', async () => {
    // Without this a backend restart orphans 15 minutes of upstream work.
    let idPersistedBeforeWait = false;
    mockAwaitDocument.mockImplementation(async () => {
      idPersistedBeforeWait = mockSaveIntake.mock.calls.some((c) => c[0]?.architect_job_id === 'clinic-abc12345');
      return { markdown: 'doc '.repeat(100), words: 100 };
    });
    await startBuild(INPUT);
    await settle();
    expect(idPersistedBeforeWait).toBe(true);
  });

  it('skips the Architect when a document was supplied', async () => {
    await startBuild({ ...INPUT, document: '# Already have one' });
    await settle();
    expect(mockStartJob).not.toHaveBeenCalled();
    expect(mockDecompose).toHaveBeenCalledWith(expect.objectContaining({ document: '# Already have one' }));
  });
});

describe('degrading when the Architect fails', () => {
  beforeEach(() => { process.env.SBP_USE_ARCHITECT = 'true'; });

  it('still produces a plan when the job errors', async () => {
    // A thinner plan is a worse outcome. Losing the build entirely because a
    // third-party service was down is a much worse one.
    mockAwaitDocument.mockRejectedValue(Object.assign(new Error('boom'), { error_class: 'GenerationFailed' }));
    await startBuild(INPUT);
    await settle();

    expect(mockDecompose).toHaveBeenCalledWith(expect.objectContaining({ document: '' }));
    expect(mockSaveDraft).toHaveBeenCalled();
    expect(statuses()).not.toContain('failed');
  });

  it('still produces a plan when the job cannot even be started', async () => {
    mockStartJob.mockRejectedValue(Object.assign(new Error('409'), { error_class: 'JobConflict' }));
    await startBuild(INPUT);
    await settle();
    expect(mockSaveDraft).toHaveBeenCalled();
    expect(statuses()).not.toContain('failed');
  });

  it('still produces a plan when the wait hits its deadline', async () => {
    mockAwaitDocument.mockRejectedValue(Object.assign(new Error('too slow'), { error_class: 'DeadlineExceeded' }));
    await startBuild(INPUT);
    await settle();
    expect(mockDecompose).toHaveBeenCalled();
  });
});

describe('the ten answers supersede the four legacy fields', () => {
  it('builds the brief from answers when they are present', () => {
    const brief = buildBriefText({ ...INPUT } as any);
    expect(brief).toContain('IMPLEMENTATION CONSTRAINTS');
    expect(brief).toContain(ANSWERS.q7_measure);
    expect(brief).not.toContain('WHO USES IT:');      // the legacy heading
  });

  it('falls back to the four fields for a build submitted the old way', () => {
    const brief = buildBriefText({
      projectId: PROJECT, enrollmentId: ENROLLMENT, idea: 'An idea.',
      users: 'Managers', dataSources: 'Postgres', doneDefinition: 'Exactly once',
    } as any);
    expect(brief).toContain('WHO USES IT: Managers');
  });

  it('ignores an answers object that is present but empty', () => {
    const brief = buildBriefText({
      projectId: PROJECT, enrollmentId: ENROLLMENT, idea: 'An idea.',
      users: 'Managers', answers: { q1_job: '   ' },
    } as any);
    expect(brief).toContain('WHO USES IT: Managers');
  });
});
