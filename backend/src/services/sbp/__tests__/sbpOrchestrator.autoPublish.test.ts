/**
 * Auto-publish — the step that was missing on the night five students got
 * unusable projects.
 *
 * The pipeline generated five correct plans, the gate passed all five, and all
 * five came to rest in `build_plans.status = 'draft'`. Publishing is what writes
 * STORY-000, the due dates and the 3-4k-character prompts into `student_tasks`,
 * and nothing called it: `publishBuild` had exactly one caller, an HTTP route no
 * screen in the product ever hit. Every student fell back to the browser's local
 * ten-task template.
 *
 * The three invariants this file holds:
 *   1. A gate-clean plan reaches the student with no human in the loop.
 *   2. A plan with a BLOCKING violation still does not. It fails closed, and the
 *      violation is stored so the student is told what is missing.
 *   3. A publish that fails does not cost the student their plan — it stays
 *      `drafted` (not `failed`), and retrying is safe.
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
const mockRepoFor = jest.fn();
const mockSequelizeQuery = jest.fn();

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
jest.mock('../workspaceRepo', () => ({ repoForProject: (...a: any[]) => mockRepoFor(...a) }));
// The active-project pointer write and the cohort schedule lookup both reach
// for the real database through a dynamic import. Mocked for the same reason as
// in sbpOrchestrator.test.ts: loading Sequelize inside this suite is slow and
// intermittently flaky under parallel runs, and both writes have their own tests.
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: any[]) => mockSequelizeQuery(...a) },
}));

import { startBuild } from '../sbpOrchestrator';
import { BuildPlan } from '../planContract';
import { hashPlan } from '../planHash';

const PROJECT = '11111111-1111-1111-1111-111111111111';
const ENROLLMENT = '22222222-2222-2222-2222-222222222222';
const REPO = { owner: 'ColaberryIntern', repo: 'roster-1111', url: 'https://github.com/ColaberryIntern/roster-1111' };

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

/** A plan whose REQ-002 is fulfilled by no story ⇒ `must_uncovered`, BLOCKING. */
const gappedPlan: BuildPlan = {
  ...goodPlan,
  requirements: [
    ...goodPlan.requirements,
    { id: 'REQ-002', statement: 'A manager can revoke a seat.', kind: 'FUNC', priority: 'must', cluster: 'Roster' },
  ],
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
  document: '',
};

/** Generation runs on the queue; drain the microtask/timer chain it leaves. */
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };

/** Every status `setStatus` wrote, in order. The last one is where the build rests. */
const statuses = (): string[] => mockSaveIntake.mock.calls.map((c) => c[0].status);
const finalStatus = (): string => statuses()[statuses().length - 1];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  delete process.env.SBP_AUTO_PUBLISH;
  mockGetIntake.mockResolvedValue({ project_id: PROJECT, idea: INPUT.idea, status: 'captured', correlation_id: 'corr-1' });
  mockSaveIntake.mockResolvedValue({ project_id: PROJECT, status: 'generating' });
  mockRepairCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ stories: [] }) } }] });
  mockDecompose.mockResolvedValue({ plan: goodPlan, attempts: 1, model: 'gpt-4o', client: { create: mockRepairCreate } });
  mockSaveDraft.mockImplementation(async (_p: string, plan: BuildPlan) =>
    storedPlan({ plan, plan_sha256: hashPlan(plan) }));
  mockGetPlan.mockImplementation(async () => storedPlan());
  mockPublishPlan.mockImplementation(async () => storedPlan({ status: 'published', published_at: 'now' }));
  mockWriteDocs.mockResolvedValue({ committed: true, commitSha: 'abc1234', changedPaths: ['docs/REQUIREMENTS.md'], skippedUnchanged: 0 });
  mockMaterialize.mockResolvedValue({ lists: 5, tasks: 12, preservedComplete: 0 });
  mockRepoFor.mockResolvedValue(REPO);
  // The cohort-schedule query, then the active-project UPDATE.
  mockSequelizeQuery.mockResolvedValue([[], []]);
});
afterEach(() => jest.restoreAllMocks());

// ── 1. a gate-clean plan reaches the student on its own ─────────────────────
describe('a gate-clean plan reaches the student without anyone publishing it', () => {
  it('promotes the plan it just generated', async () => {
    await startBuild(INPUT as any);
    await flush();
    expect(mockPublishPlan).toHaveBeenCalledTimes(1);
    expect(finalStatus()).toBe('published');
  });

  it('materializes it into student tasks — the rows the portal actually renders', async () => {
    await startBuild(INPUT as any);
    await flush();
    // This is the assertion that fails on the code that shipped tonight: the
    // plan was generated and stored, and materializePlanAsTasks was never
    // reached, so student_tasks stayed empty and the browser fallback won.
    expect(mockMaterialize).toHaveBeenCalledWith(
      PROJECT, ENROLLMENT, goodPlan, expect.objectContaining({ repoUrl: REPO.url }),
    );
  });

  it('passes the generated plan\'s hash, so it cannot publish a plan it never graded', async () => {
    await startBuild(INPUT as any);
    await flush();
    expect(mockPublishPlan).toHaveBeenCalledWith(PROJECT, 1, hashPlan(goodPlan));
  });

  it('publishes to awaiting_repo — not nowhere — when the student has no repo yet', async () => {
    mockRepoFor.mockResolvedValue(null);
    await startBuild(INPUT as any);
    await flush();
    expect(mockMaterialize).toHaveBeenCalled();
    expect(mockWriteDocs).not.toHaveBeenCalled();
    expect(finalStatus()).toBe('awaiting_repo');
  });

  it('publishes a plan whose only leftover violations are advisory', async () => {
    // The production case: repair could not clear one `story_redundant_scaffold`.
    // Advisory violations are warnings on a real plan, not a reason to hand the
    // student a template instead.
    const redundant: BuildPlan = {
      ...goodPlan,
      requirements: [
        ...goodPlan.requirements,
        { id: 'REQ-002', statement: 'A manager can revoke a seat.', kind: 'FUNC', priority: 'must', cluster: 'Roster' },
      ],
      stories: [
        { ...goodPlan.stories[0], fulfills: ['REQ-001'] },
        { ...goodPlan.stories[0], id: 'STORY-002', title: 'Manager revokes a seat', fulfills: ['REQ-002'] },
        { ...goodPlan.stories[0], id: 'STORY-003', title: 'Manager manages the roster', fulfills: ['REQ-001', 'REQ-002'] },
      ],
    };
    mockDecompose.mockResolvedValue({ plan: redundant, attempts: 1, model: 'gpt-4o', client: { create: mockRepairCreate } });
    await startBuild(INPUT as any);
    await flush();
    const gate = mockSaveDraft.mock.calls[0][2].gate;
    expect(gate.ok).toBe(false);                                  // imperfect…
    expect(gate.violations.some((v: any) => v.rule === 'story_redundant_scaffold')).toBe(true);
    expect(mockPublishPlan).toHaveBeenCalled();                   // …but still shipped
    expect(finalStatus()).toBe('published');
  });
});

// ── 2. a blocking violation still stops at the gate ─────────────────────────
describe('a plan with a BLOCKING violation does not auto-publish', () => {
  beforeEach(() => {
    mockDecompose.mockResolvedValue({ plan: gappedPlan, attempts: 1, model: 'gpt-4o', client: { create: mockRepairCreate } });
    // Repair is attempted and cannot close the gap; it returns the plan as-is.
    mockRepairCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ stories: [] }) } }] });
  });

  it('never promotes it, and never writes tasks or documents', async () => {
    await startBuild(INPUT as any);
    await flush();
    expect(mockPublishPlan).not.toHaveBeenCalled();
    expect(mockMaterialize).not.toHaveBeenCalled();
    expect(mockWriteDocs).not.toHaveBeenCalled();
  });

  it('rests at gate_failed rather than looking like a success', async () => {
    await startBuild(INPUT as any);
    await flush();
    expect(finalStatus()).toBe('gate_failed');
  });

  it('stores the violation, so the student can be told WHAT is missing', async () => {
    await startBuild(INPUT as any);
    await flush();
    const gate = mockSaveDraft.mock.calls[0][2].gate;
    const uncovered = gate.violations.find((v: any) => v.rule === 'must_uncovered');
    expect(uncovered).toBeDefined();
    expect(uncovered.message).toContain('REQ-002');
  });
});

// ── 3. a publish failure costs visibility, never the plan ───────────────────
describe('when auto-publish fails', () => {
  it('leaves the build drafted — not failed — so the student is not told to regenerate a good plan', async () => {
    mockPublishPlan.mockRejectedValue(Object.assign(new Error('db down'), { error_class: 'UpstreamUnavailable' }));
    await startBuild(INPUT as any);
    await flush();
    expect(mockSaveDraft).toHaveBeenCalled();
    expect(finalStatus()).toBe('drafted');
    expect(statuses()).not.toContain('failed');
  });

  it('logs the failure with an error class rather than swallowing it', async () => {
    const logs: string[] = [];
    (console.log as jest.Mock).mockImplementation((line: string) => { logs.push(String(line)); });
    mockRepoFor.mockRejectedValue(Object.assign(new Error('github unreachable'), { error_class: 'UpstreamUnavailable' }));
    await startBuild(INPUT as any);
    await flush();
    const failure = logs.map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .find((e) => e?.event === 'sbp_autopublish_failed');
    expect(failure).toBeDefined();
    expect(failure.outcome).toBe('failure');
    expect(failure.context.error_class).toBe('UpstreamUnavailable');
    expect(failure.context.recovery).toContain('publish');
  });
});

// ── the kill switch ─────────────────────────────────────────────────────────
describe('SBP_AUTO_PUBLISH=off', () => {
  it('holds the plan at drafted for a human, and still does not lose it', async () => {
    process.env.SBP_AUTO_PUBLISH = 'off';
    await startBuild(INPUT as any);
    await flush();
    expect(mockPublishPlan).not.toHaveBeenCalled();
    expect(mockSaveDraft).toHaveBeenCalled();
    expect(finalStatus()).toBe('drafted');
  });
});
