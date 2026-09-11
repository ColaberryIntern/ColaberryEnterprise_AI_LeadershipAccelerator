/**
 * Serve-time re-hydration of `project:` items.
 *
 * Reproduces the defect Ali reported on prod 2026-09-11, the day after #2426
 * shipped Project Task routing: "the project workspace is still not working."
 * Read-only probe showed 360 project-task impressions across 26 students with
 * project_id / project_task_id on NONE of them. The ids had been added at
 * compose time only. The Today feed is an append-only snapshot store, so every
 * row placed before the deploy kept its old shape and still opened the drawer.
 *
 * Community items had a serve-time rehydrate for exactly this; project items
 * were missed. These tests pin the repair, and pin that it is fail-soft — the
 * feed must serve even if the task lookup throws.
 */
jest.mock('../../../models/index', () => ({}));

const mockFindAll = jest.fn();
jest.mock('../../../models/StudentTask', () => ({
  __esModule: true,
  default: { findAll: (...args: any[]) => mockFindAll(...args) },
}));
jest.mock('../../../models/CommunityPost', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../../models/CommunityMember', () => ({ __esModule: true, default: {} }));

// The story price tag comes from the module the verifier pays from. Mocked so
// these tests own the rate; `pointsByStoryId` is the real pure mapper.
const mockStoryPoints = jest.fn();
jest.mock('../../sbp/verification/storyPoints', () => ({
  storyPointsForProject: (...args: any[]) => mockStoryPoints(...args),
  pointsByStoryId: jest.requireActual('../../sbp/verification/storyPoints').pointsByStoryId,
}));

import { rehydrateProjectItems } from '../todayAnchoredSources';

const PROJ = 'a1111111-1111-4111-8111-111111111111';
const TASK = 'b2222222-2222-4222-8222-222222222222';

/** A frozen impression exactly as prod stored it BEFORE the fix. */
function mkStale(taskId = TASK): any {
  return {
    position: 2, kind: 'anchored', ref: `project:${taskId}`, surface: 'project',
    type: 'project_task', render_band: 'task', card_id: null,
    title: 'old title', subtitle: 'STORY-014', description: 'old desc', image: null, video: null,
    blog: null, content: null, week: null, estimated_time: null, status: 'available', interacted: false,
  };
}

const stub = (rows: any[]) => mockFindAll.mockResolvedValue(rows.map((r) => ({ get: () => r })));

beforeEach(() => {
  mockFindAll.mockReset();
  mockStoryPoints.mockReset();
  mockStoryPoints.mockResolvedValue(null);   // no published plan unless a test says otherwise
});

describe('rehydrateProjectItems', () => {
  it('stamps project_id and project_task_id onto a FROZEN impression that never had them', async () => {
    const items = [mkStale()];
    stub([{ id: TASK, project_id: PROJ, title: 'Provide a Why Now? explanation', description: 'desc', status: 'in_progress', release_key: 'STORY-014' }]);

    await rehydrateProjectItems(items);

    // The whole defect in two lines: without these, projectWorkspacePath()
    // returns null and the tile opens the drawer.
    expect(items[0].project_id).toBe(PROJ);
    expect(items[0].project_task_id).toBe(TASK);
    expect(items[0].card_id).toBeNull();
  });

  it('refreshes title, description and status from the LIVE task', async () => {
    const items = [mkStale()];
    stub([{ id: TASK, project_id: PROJ, title: 'Renamed task', description: 'new desc', status: 'complete', release_key: 'STORY-014' }]);

    await rehydrateProjectItems(items);

    expect(items[0].title).toBe('Renamed task');
    expect(items[0].description).toBe('new desc');
    expect(items[0].status).toBe('completed');
  });

  it('is idempotent — a second pass changes nothing', async () => {
    const items = [mkStale()];
    const row = { id: TASK, project_id: PROJ, title: 'T', description: 'D', status: 'available', release_key: null };
    stub([row]);
    await rehydrateProjectItems(items);
    const first = JSON.parse(JSON.stringify(items));
    stub([row]);
    await rehydrateProjectItems(items);
    expect(items).toEqual(first);
  });

  it('leaves an item alone when its task is gone, and never throws', async () => {
    const items = [mkStale('deleted-task')];
    stub([]);
    await expect(rehydrateProjectItems(items)).resolves.toBeUndefined();
    expect(items[0].project_id).toBeUndefined();
    expect(items[0].title).toBe('old title');
  });

  it('fails soft when the lookup throws — the feed still serves', async () => {
    const items = [mkStale()];
    mockFindAll.mockRejectedValue(new Error('connection terminated'));
    await expect(rehydrateProjectItems(items)).resolves.toBeUndefined();
    expect(items[0].title).toBe('old title');
  });

  it('makes ONE batched query for many items, and none for non-project items', async () => {
    const items = [mkStale('t1'), mkStale('t2'), mkStale('t1'), { ...mkStale(), ref: 'card:c1', card_id: 'c1' }];
    stub([]);
    await rehydrateProjectItems(items);
    expect(mockFindAll).toHaveBeenCalledTimes(1);
    expect(mockFindAll.mock.calls[0][0].where.id).toEqual(['t1', 't2']);   // de-duplicated

    mockFindAll.mockReset();
    await rehydrateProjectItems([{ ...mkStale(), ref: 'card:c1' }]);
    expect(mockFindAll).not.toHaveBeenCalled();
  });
});

/**
 * The price tag, at serve time. Ali, 2026-09-11: "points should be on the
 * Today timeline for the project work." Every project impression on prod was
 * frozen with no `points` at all; the tile can only show what this stamps.
 */
describe('rehydrateProjectItems — the story price tag', () => {
  const priced = () => mockStoryPoints.mockResolvedValue({ per_story: 57, story_ids: new Set(['STORY-000', 'STORY-014']), stories_in_plan: 14 });

  it('stamps the build rate onto a FROZEN impression of a plan story', async () => {
    const item = mkStale();
    stub([{ id: TASK, project_id: PROJ, story_id: 'STORY-014', title: 'T', description: null, status: 'not_started', release_key: 'r0' }]);
    priced();
    await rehydrateProjectItems([item]);
    expect(item.points).toEqual({ builder: 57 });
    expect(mockStoryPoints).toHaveBeenCalledWith(PROJ);
  });

  it('prices NOTHING that is not a plan story — a demo-prep task carries no badge', async () => {
    const item = mkStale();
    stub([{ id: TASK, project_id: PROJ, story_id: 'PREP-1', title: 'Rehearse the demo', description: null, status: 'not_started', release_key: 'prep' }]);
    priced();
    await rehydrateProjectItems([item]);
    expect(item.points).toBeNull();
  });

  it('prices nothing when the project has no published plan, and nothing when the budget is unset', async () => {
    const a = mkStale();
    stub([{ id: TASK, project_id: PROJ, story_id: 'STORY-014', title: 'T', description: null, status: 'not_started', release_key: 'r0' }]);
    await rehydrateProjectItems([a]);                       // default: null plan
    expect(a.points).toBeNull();

    const b = mkStale();
    mockStoryPoints.mockResolvedValue({ per_story: 0, story_ids: new Set(['STORY-014']), stories_in_plan: 1 });
    await rehydrateProjectItems([b]);
    expect(b.points).toBeNull();                            // never "+0 pts"
  });

  it('reads the plan ONCE per project for many items, and fails soft if that read throws', async () => {
    stub([
      { id: 't1', project_id: PROJ, story_id: 'STORY-000', title: 'A', description: null, status: 'not_started', release_key: 'r0' },
      { id: 't2', project_id: PROJ, story_id: 'STORY-014', title: 'B', description: null, status: 'not_started', release_key: 'r0' },
    ]);
    priced();
    const items = [mkStale('t1'), mkStale('t2')];
    await rehydrateProjectItems(items);
    expect(mockStoryPoints).toHaveBeenCalledTimes(1);
    expect(items.map((i) => i.points)).toEqual([{ builder: 57 }, { builder: 57 }]);

    mockStoryPoints.mockRejectedValue(new Error('points_config unreachable'));
    const again = [mkStale('t1')];
    await expect(rehydrateProjectItems(again)).resolves.toBeUndefined();
    expect(again[0].project_task_id).toBe('t1');            // the rest of the rehydrate still landed
    expect(again[0].points).toBeNull();
  });
});
