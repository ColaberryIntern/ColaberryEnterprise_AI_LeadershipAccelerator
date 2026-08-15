/**
 * The budget award model.
 *
 * The property worth the most here: A BUDGET IS NEVER READ AS A RATE. Every
 * degenerate path — missing row, NULL budget, zero stories, a generic caller
 * asking a budget row for its flat value — must land on 0 rather than on a
 * plausible-looking number, because a budget handed back as a rate would pay
 * the entire capstone budget for every single story.
 */
jest.mock('../../../models/PointsConfig', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));
jest.mock('../../timeline/typeRegistry', () => ({
  resolve: jest.fn(),
}));

import PointsConfig from '../../../models/PointsConfig';
import { resolve as resolveType } from '../../timeline/typeRegistry';
import {
  getTypeXp,
  getBudgetPerUnitXp,
  AWARD_MODEL_BUDGET_PER_BUILD,
} from '../pointsConfigService';

const mockFindOne = (PointsConfig as any).findOne as jest.Mock;
const mockResolve = resolveType as unknown as jest.Mock;

const KEY = 'project_story_verified';

/** A points_config row shaped as Sequelize hands it back. */
function budgetRow(builder_xp: number | null) {
  return {
    learning_xp: 0,
    builder_xp,
    community_xp: 0,
    config: { award_model: AWARD_MODEL_BUDGET_PER_BUILD },
  };
}

function flatRow(builder_xp: number | null) {
  return { learning_xp: 10, builder_xp, community_xp: 0, config: {} };
}

beforeEach(() => {
  mockFindOne.mockReset();
  mockResolve.mockReset();
});

describe('getBudgetPerUnitXp — the division', () => {
  it('splits an 800 budget across 20 stories at 40 each', async () => {
    mockFindOne.mockResolvedValue(budgetRow(800));
    const award = await getBudgetPerUnitXp(KEY, 20);
    expect(award).toEqual({ per_unit: 40, budget: 800, reason: null });
  });

  it('splits an 800 budget across 30 stories at 27 each (rounded)', async () => {
    mockFindOne.mockResolvedValue(budgetRow(800));
    const award = await getBudgetPerUnitXp(KEY, 30);
    // 800/30 = 26.67 -> 27
    expect(award.per_unit).toBe(27);
  });

  it('pays the whole budget when the plan is a single story', async () => {
    mockFindOne.mockResolvedValue(budgetRow(800));
    expect((await getBudgetPerUnitXp(KEY, 1)).per_unit).toBe(800);
  });

  it('keeps the total near the budget regardless of how the plan decomposes', async () => {
    mockFindOne.mockResolvedValue(budgetRow(800));
    for (const stories of [8, 12, 17, 20, 23, 30, 41]) {
      const { per_unit } = await getBudgetPerUnitXp(KEY, stories);
      const total = per_unit * stories;
      // Rounding is per story, so the build total drifts by at most half a
      // story's worth in each direction. It must never scale with story count.
      expect(Math.abs(total - 800)).toBeLessThanOrEqual(stories / 2 + 1);
    }
  });

  it('never awards a fraction', async () => {
    mockFindOne.mockResolvedValue(budgetRow(800));
    for (const stories of [3, 7, 9, 13, 60]) {
      const { per_unit } = await getBudgetPerUnitXp(KEY, stories);
      expect(Number.isInteger(per_unit)).toBe(true);
    }
  });
});

describe('getBudgetPerUnitXp — failing closed', () => {
  it('awards 0 when there is no config row at all', async () => {
    mockFindOne.mockResolvedValue(null);
    expect(await getBudgetPerUnitXp(KEY, 20)).toEqual({ per_unit: 0, budget: null, reason: 'not_a_budget_row' });
  });

  it('awards 0 when the row is a flat rate row, not a budget row', async () => {
    mockFindOne.mockResolvedValue(flatRow(40));
    const award = await getBudgetPerUnitXp(KEY, 20);
    expect(award.per_unit).toBe(0);
    expect(award.reason).toBe('not_a_budget_row');
  });

  it('awards 0 when the budget is still NULL', async () => {
    mockFindOne.mockResolvedValue(budgetRow(null));
    expect(await getBudgetPerUnitXp(KEY, 20)).toEqual({ per_unit: 0, budget: null, reason: 'no_budget_set' });
  });

  it('awards 0 rather than dividing by zero when the plan has no stories', async () => {
    mockFindOne.mockResolvedValue(budgetRow(800));
    const award = await getBudgetPerUnitXp(KEY, 0);
    expect(award.per_unit).toBe(0);
    expect(award.reason).toBe('no_units');
    expect(Number.isFinite(award.per_unit)).toBe(true);
  });

  it('awards 0 for a negative or non-finite story count', async () => {
    mockFindOne.mockResolvedValue(budgetRow(800));
    expect((await getBudgetPerUnitXp(KEY, -5)).per_unit).toBe(0);
    expect((await getBudgetPerUnitXp(KEY, NaN)).per_unit).toBe(0);
  });

  it('awards 0 for a zero or negative budget', async () => {
    mockFindOne.mockResolvedValue(budgetRow(0));
    expect((await getBudgetPerUnitXp(KEY, 20)).per_unit).toBe(0);
    mockFindOne.mockResolvedValue(budgetRow(-100));
    expect((await getBudgetPerUnitXp(KEY, 20)).per_unit).toBe(0);
  });
});

describe('getTypeXp — a budget must never leak out as a rate', () => {
  it('reports builder 0 for a budget row even though builder_xp is 800', async () => {
    mockFindOne.mockResolvedValue(budgetRow(800));
    const xp = await getTypeXp(KEY);
    expect(xp.builder).toBe(0);
  });

  it('still reports the flat builder value for an ordinary card type', async () => {
    mockFindOne.mockResolvedValue(flatRow(25));
    expect((await getTypeXp('project_task')).builder).toBe(25);
  });

  it('falls back to the registry when no row exists', async () => {
    mockFindOne.mockResolvedValue(null);
    mockResolve.mockReturnValue({ learning_xp: 5, builder_xp: 15, community_xp: 2 });
    expect(await getTypeXp('deep_dive')).toEqual({ learning: 5, builder: 15, community: 2 });
  });

  it('resolves a NULL flat value to 0', async () => {
    mockFindOne.mockResolvedValue(flatRow(null));
    expect((await getTypeXp('project_task')).builder).toBe(0);
  });
});
