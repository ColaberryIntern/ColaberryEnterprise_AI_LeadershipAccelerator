/**
 * storyPoints — one price for a story, shared by the verifier that pays it and
 * the surfaces that show it. Ali, 2026-09-11: "the projects should have points
 * instead of the open button, just like the Classroom." The number on the tile
 * must be the number paid, so it is computed in exactly one place.
 */
const mockGetPublishedPlan = jest.fn();
const mockGetBudgetPerUnitXp = jest.fn();
jest.mock('../../planStore', () => ({
  getPublishedPlan: (...a: any[]) => mockGetPublishedPlan(...a),
}));
jest.mock('../../../progression/pointsConfigService', () => ({
  getBudgetPerUnitXp: (...a: any[]) => mockGetBudgetPerUnitXp(...a),
}));

import { planStorySpecs, storyPointsForProject, pointsByStoryId, STORY_XP_KEY } from '../storyPoints';
import { COMMAND_CENTER_STORY_ID, COMMAND_CENTER_ACCEPTANCE } from '../../commandCenterStory';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const plan = (stories: Array<{ id: string; acceptance?: unknown }>) => ({ stories });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetBudgetPerUnitXp.mockResolvedValue({ per_unit: 57, budget: 800, reason: null });
});

describe('planStorySpecs — the stories that are judged and paid', () => {
  it('is the plan PLUS the Command Center, which the plan never lists', () => {
    const specs = planStorySpecs(plan([{ id: 'STORY-001', acceptance: ['a', 'b'] }, { id: 'STORY-002' }]) as any);
    expect(specs.map((s) => s.id)).toEqual(['STORY-001', 'STORY-002', COMMAND_CENTER_STORY_ID]);
    expect(specs[0].acceptance).toEqual(['a', 'b']);
    expect(specs[1].acceptance).toEqual([]);
    expect(specs[2].acceptance).toEqual([...COMMAND_CENTER_ACCEPTANCE]);
  });

  it('does not append a second STORY-000 when the plan carries its own — the plan is the authority', () => {
    const specs = planStorySpecs(plan([{ id: COMMAND_CENTER_STORY_ID, acceptance: ['mine'] }, { id: 'STORY-001' }]) as any);
    expect(specs.filter((s) => s.id === COMMAND_CENTER_STORY_ID)).toHaveLength(1);
    expect(specs.find((s) => s.id === COMMAND_CENTER_STORY_ID)!.acceptance).toEqual(['mine']);
  });

  it('coerces acceptance to strings and tolerates a plan with no stories', () => {
    expect(planStorySpecs(plan([{ id: 'S', acceptance: [1, 'x'] }]) as any)[0].acceptance).toEqual(['1', 'x']);
    expect(planStorySpecs({ stories: undefined } as any).map((s) => s.id)).toEqual([COMMAND_CENTER_STORY_ID]);
  });
});

describe('storyPointsForProject — the rate the verifier pays, priced for display', () => {
  it('divides the budget by the SAME count the verifier uses: plan stories + STORY-000', async () => {
    mockGetPublishedPlan.mockResolvedValue({ plan: plan([{ id: 'STORY-001' }, { id: 'STORY-002' }]) });
    const sp = await storyPointsForProject(PROJECT_ID);
    expect(mockGetBudgetPerUnitXp).toHaveBeenCalledWith(STORY_XP_KEY, 3);
    expect(sp).toEqual({ per_story: 57, story_ids: new Set(['STORY-001', 'STORY-002', COMMAND_CENTER_STORY_ID]), stories_in_plan: 3 });
  });

  it('is null with no published plan — there is nothing to price', async () => {
    mockGetPublishedPlan.mockResolvedValue(null);
    expect(await storyPointsForProject(PROJECT_ID)).toBeNull();
    expect(mockGetBudgetPerUnitXp).not.toHaveBeenCalled();
  });

  it('carries the budget helper\'s fail-closed 0 rather than inventing a number', async () => {
    mockGetPublishedPlan.mockResolvedValue({ plan: plan([{ id: 'STORY-001' }]) });
    mockGetBudgetPerUnitXp.mockResolvedValue({ per_unit: 0, budget: null, reason: 'no_budget_set' });
    expect((await storyPointsForProject(PROJECT_ID))!.per_story).toBe(0);
  });
});

describe('pointsByStoryId — what the tree mapper reads', () => {
  it('maps every paid story to the rate, and nothing else', () => {
    const m = pointsByStoryId({ per_story: 57, story_ids: new Set(['STORY-001', COMMAND_CENTER_STORY_ID]), stories_in_plan: 2 });
    expect([...m.entries()]).toEqual([['STORY-001', 57], [COMMAND_CENTER_STORY_ID, 57]]);
    expect(m.get('PREP-1')).toBeUndefined();
  });

  it('is empty for a null plan and for a 0 rate — no "+0 pts" badges anywhere', () => {
    expect(pointsByStoryId(null).size).toBe(0);
    expect(pointsByStoryId({ per_story: 0, story_ids: new Set(['STORY-001']), stories_in_plan: 1 }).size).toBe(0);
  });
});
