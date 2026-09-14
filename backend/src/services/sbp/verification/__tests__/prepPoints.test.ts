/**
 * prepPoints — what a demo-prep task pays, and the merged map every surface reads.
 */
const mockGetTypeXp = jest.fn();
const mockGetBudgetPerUnitXp = jest.fn();
const mockGetPublishedPlan = jest.fn();

jest.mock('../../../progression/pointsConfigService', () => ({
  getTypeXp: (...a: any[]) => mockGetTypeXp(...a),
  getBudgetPerUnitXp: (...a: any[]) => mockGetBudgetPerUnitXp(...a),
}));
jest.mock('../../planStore', () => ({ getPublishedPlan: (...a: any[]) => mockGetPublishedPlan(...a) }));

import { prepPointsMap, prepXpKey, isPrepStory, PREP_STORY_IDS, DEMO_DAY_STORY_ID } from '../prepPoints';
import { taskPointsForProject } from '../storyPoints';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetTypeXp.mockImplementation(async (key: string) => ({ learning: 0, community: 0, builder: key === 'presentation' ? 60 : key === 'demo' ? 40 : 0 }));
});

describe('prepPointsMap', () => {
  it('prices PREP-1…5 from `demo` and PREP-6 from `presentation` — the rows that already exist', async () => {
    const m = await prepPointsMap();
    expect([...m.entries()]).toEqual([
      ['PREP-1', 40], ['PREP-2', 40], ['PREP-3', 40], ['PREP-4', 40], ['PREP-5', 40], ['PREP-6', 60],
    ]);
    // Read each row once, not once per task.
    expect(mockGetTypeXp).toHaveBeenCalledTimes(2);
  });

  it('leaves a task OUT of the map when its row is missing or zero, so no badge is shown rather than "0 pts"', async () => {
    mockGetTypeXp.mockImplementation(async (key: string) => ({ learning: 0, community: 0, builder: key === 'presentation' ? 60 : 0 }));
    const m = await prepPointsMap();
    expect([...m.keys()]).toEqual(['PREP-6']);
  });

  it('names the row each task is paid from, and knows which tasks are prep', () => {
    expect(prepXpKey('PREP-1')).toBe('demo');
    expect(prepXpKey(DEMO_DAY_STORY_ID)).toBe('presentation');
    expect(isPrepStory('PREP-3')).toBe(true);
    expect(isPrepStory('STORY-003')).toBe(false);
    expect(isPrepStory(null)).toBe(false);
    expect(PREP_STORY_IDS).toHaveLength(6);
  });
});

describe('taskPointsForProject', () => {
  it('merges story prices from the budget with prep prices, so one map prices every task', async () => {
    mockGetPublishedPlan.mockResolvedValue({ plan: { stories: [{ id: 'STORY-001', acceptance: [] }, { id: 'STORY-002', acceptance: [] }] } });
    mockGetBudgetPerUnitXp.mockResolvedValue({ per_unit: 50, budget: 150, units: 3 });
    const m = await taskPointsForProject('p1');
    // Two plan stories + STORY-000, at the budget split; six prep tasks at their flat rates.
    expect(m.get('STORY-000')).toBe(50);
    expect(m.get('STORY-001')).toBe(50);
    expect(m.get('PREP-1')).toBe(40);
    expect(m.get('PREP-6')).toBe(60);
    expect(m.size).toBe(9);
  });

  it('still prices prep tasks when the build has no published plan', async () => {
    mockGetPublishedPlan.mockResolvedValue(null);
    const m = await taskPointsForProject('p1');
    expect(m.has('STORY-000')).toBe(false);
    expect(m.get('PREP-2')).toBe(40);
    expect(m.size).toBe(6);
  });
});
