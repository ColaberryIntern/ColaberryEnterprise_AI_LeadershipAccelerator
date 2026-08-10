/**
 * sbpOrchestrator — the chain nothing was calling until now.
 *
 * Two invariants carry the weight:
 *   1. A gate-failed plan is NEVER published. "Published" has to mean every
 *      must-have requirement is covered, or the word means nothing.
 *   2. Publishing promotes the reviewed draft and never regenerates — the pilot
 *      regenerated between review and commit, which is how a reviewed 6/3/1/1/1
 *      plan shipped as 8/1/1/1/1.
 */
const mockDecompose = jest.fn();
const mockSaveIntake = jest.fn();
const mockGetIntake = jest.fn();
const mockSaveDraft = jest.fn();
const mockGetPlan = jest.fn();
const mockPublishPlan = jest.fn();
const mockWriteDocs = jest.fn();
const mockRepairCreate = jest.fn();
const mockMaterialize = jest.fn();

jest.mock('../decomposeService', () => ({ decomposeBuild: (...a: any[]) => mockDecompose(...a) }));
jest.mock('../planStore', () => ({
  saveIntake: (...a: any[]) => mockSaveIntake(...a),
  getIntake: (...a: any[]) => mockGetIntake(...a),
  savePlanDraft: (...a: any[]) => mockSaveDraft(...a),
  getPlan: (...a: any[]) => mockGetPlan(...a),
  publishPlan: (...a: any[]) => mockPublishPlan(...a),
}));
jest.mock('../repoWriter', () => ({ writeDocsToRepo: (...a: any[]) => mockWriteDocs(...a) }));
jest.mock('../materializeTasks', () => ({ materializePlanAsTasks: (...a: any[]) => mockMaterialize(...a) }));

import { startBuild, publishBuild, getBuildState, buildBriefText } from '../sbpOrchestrator';
import { BuildPlan } from '../planContract';
import { hashPlan } from '../planHash';

const PROJECT = '11111111-1111-1111-1111-111111111111';
const ENROLLMENT = '22222222-2222-2222-2222-222222222222';

const goodPlan: BuildPlan = {
  project_name: 'Sponsor Dashboard',
  descriptor: 'Corporate seat management',
  requirements: [{ id: 'REQ-001', statement: 'A manager can build a roster.', kind: 'FUNC', priority: 'must', cluster: 'Roster' }],
  releases: [{ key: 'r0', name: 'Skeleton', goal: 'g', demo: 'd', week_start: 1, week_end: 2 }],
  stories: [{
    id: 'STORY-001', release: 'r0', title: 'Manager builds a roster',
    narrative: 'As a manager, I want to add employees, so that I can buy seats.',
    fulfills: ['REQ-001'], owner_agent: 'Roster',
    acceptance: ['Given a, when b, then c.', 'Given d, when e, then f.', 'Trust - the audit log records it.'],
    task_guidance: 'Build the roster endpoint.', failure_paths: ['duplicate email'], blocked_by: [],
  }],
};

const storedPlan = (over: Record<string, unknown> = {}) => ({
  id: 'p1', project_id: PROJECT, version: 1, status: 'draft',
  plan: goodPlan, plan_sha256: hashPlan(goodPlan),
  gate_ok: true, gate_violations: [], model: 'gpt-4o', attempts: 1,
  correlation_id: 'corr-1', published_at: null, created_at: 'now',
  ...over,
});

const INPUT = {
  projectId: PROJECT, enrollmentId: ENROLLMENT,
  idea: 'A sponsor dashboard so a corporate buyer can put their team through the course.',
  users: 'Corporate L&D managers', dataSources: 'PaySimple, Postgres, Mandrill',
  doneDefinition: 'The same webhook twice provisions exactly once', targetWeeks: 6,
  document: '# Chapter 1\nExpanded detail.',
};

const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockGetIntake.mockResolvedValue({ project_id: PROJECT, idea: INPUT.idea, status: 'captured', correlation_id: 'corr-1' });
  mockSaveIntake.mockResolvedValue({ project_id: PROJECT, status: 'generating' });
  // Repair reuses the client the decomposer returns; a repair is only attempted
  // when the gate fails, so this stub throws if called for a clean plan.
  mockRepairCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ stories: [] }) } }] });
  mockDecompose.mockResolvedValue({ plan: goodPlan, attempts: 1, model: 'gpt-4o', client: { create: mockRepairCreate } });
  mockSaveDraft.mockResolvedValue(storedPlan());
  mockGetPlan.mockResolvedValue(storedPlan());
  mockPublishPlan.mockResolvedValue(storedPlan({ status: 'published', published_at: 'now' }));
  mockWriteDocs.mockResolvedValue({ committed: true, commitSha: 'abc1234', changedPaths: ['docs/REQUIREMENTS.md'], skippedUnchanged: 0 });
  mockMaterialize.mockResolvedValue({ lists: 5, tasks: 12, preservedComplete: 0 });
});
afterEach(() => jest.restoreAllMocks());

// ── the brief ───────────────────────────────────────────────────────────────
describe('buildBriefText', () => {
  it('carries every sharpening answer, not just the idea', () => {
    const brief = buildBriefText(INPUT as any);
    expect(brief).toContain(INPUT.idea);
    expect(brief).toContain('Corporate L&D managers');
    expect(brief).toContain('PaySimple, Postgres, Mandrill');
    expect(brief).toContain('provisions exactly once');
    expect(brief).toContain('6 weeks');
  });

  it('omits answers the student did not give rather than inventing them', () => {
    const brief = buildBriefText({ projectId: PROJECT, enrollmentId: ENROLLMENT, idea: 'Just an idea.' } as any);
    expect(brief).toBe('Just an idea.');
  });
});

// ── start ───────────────────────────────────────────────────────────────────
describe('startBuild', () => {
  it('persists the intake BEFORE generating, so a failure is replayable', async () => {
    await startBuild(INPUT as any);
    expect(mockSaveIntake).toHaveBeenCalled();
    const saved = mockSaveIntake.mock.calls[0][0];
    expect(saved.idea).toBe(INPUT.idea);
    expect(saved.status).toBe('generating');
  });

  it('returns immediately with a correlation id — generation is not awaited', async () => {
    const result = await startBuild(INPUT as any);
    expect(result.status).toBe('generating');
    expect(result.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('does not start a second run for a build already generating', async () => {
    mockGetIntake.mockResolvedValue({ project_id: PROJECT, idea: 'x', status: 'generating' });
    await startBuild(INPUT as any);
    await flush();
    expect(mockDecompose).not.toHaveBeenCalled();
  });

  it('feeds the decomposer the brief AND the document', async () => {
    await startBuild(INPUT as any);
    await flush();
    const call = mockDecompose.mock.calls[0][0];
    expect(call.brief).toContain('Corporate L&D managers');
    expect(call.document).toContain('Expanded detail');
  });

  it('records a gate-clean plan as drafted', async () => {
    await startBuild(INPUT as any);
    await flush();
    expect(mockSaveDraft).toHaveBeenCalled();
    const statuses = mockSaveIntake.mock.calls.map((c) => c[0].status);
    expect(statuses).toContain('drafted');
  });

  it('records a gate-FAILING plan as gate_failed and still stores it, so the student sees why', async () => {
    const gapped: BuildPlan = {
      ...goodPlan,
      requirements: [...goodPlan.requirements, { id: 'REQ-002', statement: 'Uncovered must.', kind: 'FUNC', priority: 'must', cluster: 'X' }],
    };
    mockDecompose.mockResolvedValue({ plan: gapped, attempts: 1, model: 'gpt-4o', client: { create: mockRepairCreate } });
    await startBuild(INPUT as any);
    await flush();
    expect(mockSaveDraft).toHaveBeenCalled();
    expect(mockSaveDraft.mock.calls[0][2].gate.ok).toBe(false);
    // FINAL status, not "contains". An earlier version of this test used
    // toContain and passed while the code threw immediately afterwards and
    // ended up in 'failed' — the status was set, then the run died.
    const statuses = mockSaveIntake.mock.calls.map((c) => c[0].status);
    expect(statuses[statuses.length - 1]).toBe('gate_failed');
  });

  it('records a generation failure without throwing to the caller', async () => {
    mockDecompose.mockRejectedValue(Object.assign(new Error('upstream down'), { error_class: 'UpstreamError' }));
    await expect(startBuild(INPUT as any)).resolves.toBeDefined();
    await flush();
    expect(mockSaveIntake.mock.calls.map((c) => c[0].status)).toContain('failed');
  });
});

// ── publish: the two invariants ─────────────────────────────────────────────
describe('publishBuild', () => {
  const repo = { owner: 'ColaberryIntern', repo: 'sponsor-dashboard-11111111', url: 'https://github.com/ColaberryIntern/sponsor-dashboard-11111111' };

  it('REFUSES to publish a plan that failed the gate', async () => {
    mockGetPlan.mockResolvedValue(storedPlan({ gate_ok: false }));
    await expect(publishBuild(PROJECT, { enrollmentId: ENROLLMENT, repo })).rejects.toMatchObject({ status: 409 });
    expect(mockPublishPlan).not.toHaveBeenCalled();
    expect(mockWriteDocs).not.toHaveBeenCalled();
  });

  it('promotes the reviewed draft and never regenerates', async () => {
    await publishBuild(PROJECT, { enrollmentId: ENROLLMENT, repo });
    expect(mockPublishPlan).toHaveBeenCalledWith(PROJECT, 1, undefined);
    expect(mockDecompose).not.toHaveBeenCalled();
  });

  it('passes the reviewer\'s hash through so a changed plan is refused downstream', async () => {
    const sha = hashPlan(goodPlan);
    await publishBuild(PROJECT, { enrollmentId: ENROLLMENT, repo, expectedSha: sha });
    expect(mockPublishPlan).toHaveBeenCalledWith(PROJECT, 1, sha);
  });

  it('writes the documents into the repo and reports the commit', async () => {
    const result = await publishBuild(PROJECT, { enrollmentId: ENROLLMENT, repo });
    expect(mockWriteDocs).toHaveBeenCalled();
    expect(result.commitSha).toBe('abc1234');
    expect(result.status).toBe('published');
    // Rendered from the PUBLISHED plan, carrying its version and hash.
    const files = mockWriteDocs.mock.calls[0][1];
    expect(files.some((f: any) => f.path === 'docs/REQUIREMENTS.md')).toBe(true);
    expect(files.some((f: any) => f.path === 'docs/stories/STORY-001.md')).toBe(true);
  });

  // The gap Ali found: a plan that never reaches student_tasks is invisible in
  // the portal, however correct it is.
  it('materializes the plan into student tasks so the portal can render it', async () => {
    await publishBuild(PROJECT, { enrollmentId: ENROLLMENT, repo });
    expect(mockMaterialize).toHaveBeenCalledWith(PROJECT, ENROLLMENT, goodPlan, expect.objectContaining({ repoUrl: repo.url }));
  });

  it('materializes even with NO repo — the plan must still be visible', async () => {
    await publishBuild(PROJECT, { enrollmentId: ENROLLMENT, repo: null });
    expect(mockMaterialize).toHaveBeenCalledWith(PROJECT, ENROLLMENT, goodPlan, {});
  });

  it('does not materialize a gate-failed plan', async () => {
    mockGetPlan.mockResolvedValue(storedPlan({ gate_ok: false }));
    await expect(publishBuild(PROJECT, { enrollmentId: ENROLLMENT, repo })).rejects.toMatchObject({ status: 409 });
    expect(mockMaterialize).not.toHaveBeenCalled();
  });

  it('publishes to awaiting_repo when there is no repo, rather than failing', async () => {
    const result = await publishBuild(PROJECT, { enrollmentId: ENROLLMENT, repo: null });
    expect(result.status).toBe('awaiting_repo');
    expect(result.commitSha).toBeNull();
    expect(mockWriteDocs).not.toHaveBeenCalled();
    // The plan is still promoted — the student is not blocked on repo setup.
    expect(mockPublishPlan).toHaveBeenCalled();
  });

  it('404s when there is no plan to publish', async () => {
    mockGetPlan.mockResolvedValue(null);
    await expect(publishBuild(PROJECT, { enrollmentId: ENROLLMENT, repo })).rejects.toMatchObject({ status: 404 });
  });
});

// ── state ───────────────────────────────────────────────────────────────────
describe('getBuildState', () => {
  it('returns the status and the stored plan', async () => {
    mockGetIntake.mockResolvedValue({ project_id: PROJECT, idea: 'x', status: 'drafted', correlation_id: 'corr-1' });
    const state = await getBuildState(PROJECT);
    expect(state?.status).toBe('drafted');
    expect(state?.plan?.version).toBe(1);
    expect(state?.gate?.ok).toBe(true);
  });

  it('returns null when no build exists for the project', async () => {
    mockGetIntake.mockResolvedValue(null);
    expect(await getBuildState(PROJECT)).toBeNull();
  });
});
