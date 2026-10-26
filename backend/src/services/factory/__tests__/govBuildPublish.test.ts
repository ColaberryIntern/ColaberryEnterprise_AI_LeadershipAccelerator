/**
 * govBuildPublish closes the gap that stops a gov build's commits from verifying stories: gov materialization writes
 * student_tasks but never publishes a plan, so the SBP verifier returns NoPublishedPlan. The fix RECONSTRUCTS the
 * plan from the materialized rows (not a re-decomposition, which would disagree with the board) and publishes it,
 * idempotently.
 */
const stlFindAll = jest.fn();
const stFindAll = jest.fn();
jest.mock('../../../models/StudentTaskList', () => ({ __esModule: true, default: { findAll: (...a: any[]) => stlFindAll(...a) } }));
jest.mock('../../../models/StudentTask', () => ({ __esModule: true, default: { findAll: (...a: any[]) => stFindAll(...a) } }));
const getPublishedPlan = jest.fn();
const getPlan = jest.fn();
const savePlanDraft = jest.fn();
const publishPlan = jest.fn();
jest.mock('../../sbp/planStore', () => ({
  __esModule: true,
  getPublishedPlan: (...a: any[]) => getPublishedPlan(...a),
  getPlan: (...a: any[]) => getPlan(...a),
  savePlanDraft: (...a: any[]) => savePlanDraft(...a),
  publishPlan: (...a: any[]) => publishPlan(...a),
}));

import { reconstructPlanFromTasks, ensureGovBuildPlanPublished } from '../govBuildPublish';

beforeEach(() => {
  jest.clearAllMocks();
  stlFindAll.mockResolvedValue([]); stFindAll.mockResolvedValue([]);
  getPublishedPlan.mockResolvedValue(null); getPlan.mockResolvedValue(null);
  savePlanDraft.mockResolvedValue({ version: 1, plan_sha256: 'sha1' });
  publishPlan.mockResolvedValue({});
});

describe('reconstructPlanFromTasks', () => {
  it('rebuilds releases (dropping prep) and stories (STORY-* only) with acceptance/fulfills carried verbatim', async () => {
    stlFindAll.mockResolvedValue([
      { cluster: 'prep', title: 'Prep', position: 0 },
      { cluster: 'r0', title: 'Release 0 · skeleton', status: 'in_progress', position: 1 },
    ]);
    stFindAll.mockResolvedValue([
      { story_id: 'STORY-000', release_key: 'r0', title: 'Command Center', acceptance: [], fulfills: [], status: 'complete', position: 0 },
      { story_id: 'STORY-001', release_key: 'r0', title: 'Build search', narrative: 'As a user…', acceptance: ['Given X', 'Trust Y'], fulfills: ['REQ-1'], build: 'prompt text', blocked_by: ['STORY-000'], owner_agent: 'AGENT-1', status: 'in_progress', position: 1 },
      { story_id: null, title: 'a non-story task', position: 2 },
    ]);
    const plan = await reconstructPlanFromTasks('proj-1');
    expect(plan).not.toBeNull();
    expect(plan!.releases.map((r) => r.key)).toEqual(['r0']);         // prep dropped
    expect(plan!.stories.map((s) => s.id)).toEqual(['STORY-000', 'STORY-001']); // STORY-* only
    const s1 = plan!.stories.find((s) => s.id === 'STORY-001')!;
    expect(s1.acceptance).toEqual(['Given X', 'Trust Y']);            // carried verbatim (verifier matches these)
    expect(s1.fulfills).toEqual(['REQ-1']);
    expect(s1.blocked_by).toEqual(['STORY-000']);
    expect(s1.task_guidance).toBe('prompt text');
  });

  it('invents a release for a story whose release has no list row, and returns null when there are no stories', async () => {
    stlFindAll.mockResolvedValue([]);
    stFindAll.mockResolvedValue([{ story_id: 'STORY-001', release_key: 'r2', title: 'x', acceptance: ['a'], position: 0 }]);
    const plan = await reconstructPlanFromTasks('proj-1');
    expect(plan!.releases.map((r) => r.key)).toEqual(['r2']);         // release invented from the story

    stFindAll.mockResolvedValue([{ story_id: 'not-a-story', title: 'x', position: 0 }]);
    expect(await reconstructPlanFromTasks('proj-1')).toBeNull();      // no STORY-* tasks ⇒ nothing to publish
  });
});

describe('ensureGovBuildPlanPublished — idempotent', () => {
  it('already published ⇒ no-op (never saves or publishes)', async () => {
    getPublishedPlan.mockResolvedValue({ version: 3 });
    expect(await ensureGovBuildPlanPublished('proj-1')).toEqual({ published: true, action: 'already' });
    expect(savePlanDraft).not.toHaveBeenCalled();
    expect(publishPlan).not.toHaveBeenCalled();
  });

  it('an unpublished draft exists ⇒ publishes that draft (no reconstruction)', async () => {
    getPublishedPlan.mockResolvedValue(null);
    getPlan.mockResolvedValue({ version: 2, plan_sha256: 'sha2' });
    expect(await ensureGovBuildPlanPublished('proj-1')).toEqual({ published: true, action: 'promoted_draft' });
    expect(publishPlan).toHaveBeenCalledWith('proj-1', 2, 'sha2');
    expect(savePlanDraft).not.toHaveBeenCalled();
  });

  it('no plan row at all (gov-materialized) ⇒ reconstructs from tasks, saves a draft, publishes it', async () => {
    getPublishedPlan.mockResolvedValue(null);
    getPlan.mockResolvedValue(null);
    stFindAll.mockResolvedValue([{ story_id: 'STORY-001', release_key: 'r0', title: 'x', acceptance: ['a'], position: 0 }]);
    expect(await ensureGovBuildPlanPublished('proj-1')).toEqual({ published: true, action: 'reconstructed' });
    expect(savePlanDraft).toHaveBeenCalledTimes(1);
    expect(publishPlan).toHaveBeenCalledWith('proj-1', 1, 'sha1');
  });

  it('no plan and no tasks ⇒ nothing to publish', async () => {
    getPublishedPlan.mockResolvedValue(null); getPlan.mockResolvedValue(null); stFindAll.mockResolvedValue([]);
    expect(await ensureGovBuildPlanPublished('proj-1')).toEqual({ published: false, action: 'no_tasks' });
    expect(savePlanDraft).not.toHaveBeenCalled();
  });
});
