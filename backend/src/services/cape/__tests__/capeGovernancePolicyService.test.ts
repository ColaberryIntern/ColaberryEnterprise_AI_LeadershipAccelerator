import CapeGovernancePolicy from '../../../models/CapeGovernancePolicy';
import {
  getCurrentGovernancePolicy, getCurrentGovernancePolicyRow, getGovernancePolicyHistory,
  updateGovernancePolicy, GovernancePolicyNotFoundError,
} from '../capeGovernancePolicyService';

jest.mock('../../../config/database', () => ({
  sequelize: { transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn({})) },
}));
jest.mock('../../../models/CapeGovernancePolicy', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() },
}));

const findOne = CapeGovernancePolicy.findOne as unknown as jest.Mock;
const findAll = CapeGovernancePolicy.findAll as unknown as jest.Mock;
const create = CapeGovernancePolicy.create as unknown as jest.Mock;

// Byte-identical to the hardcoded constants this table replaces
// (capeLearningValuePolicy.ts's SAME_TYPE_MAX_STREAK/PASSIVE_MAX_STREAK/
// CROWD_OUT_MAX_PER_SKILL/CROWD_OUT_WINDOW/stretch-cap-literal, and
// capeTodayPlanService.ts's current unconditional behavior).
const DEFAULTS = {
  same_type_max_streak: 2, passive_max_streak: 2, crowd_out_max_per_skill: 2,
  crowd_out_window: 5, stretch_cap_first_five: 1, daily_plan_target_minutes: 999,
  review_slot_share: 1, ai_pulse_slot_share: 1,
};

function makeCurrentRow(overrides: Record<string, any> = {}) {
  const state: Record<string, any> = { id: 'g1', version: 1, is_current: true, reason: null, created_by: null, ...DEFAULTS, ...overrides };
  state.update = jest.fn(async (patch: Record<string, any>) => { Object.assign(state, patch); return state; });
  return state;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getCurrentGovernancePolicy / getCurrentGovernancePolicyRow', () => {
  it('happy path: returns the current row values', async () => {
    findOne.mockResolvedValue(makeCurrentRow());
    const values = await getCurrentGovernancePolicy();
    expect(values).toEqual(DEFAULTS);
  });

  it('default-preserves-behavior: the plain-values read matches the exact defaults the ranker/plan currently hardcode', async () => {
    findOne.mockResolvedValue(makeCurrentRow());
    const values = await getCurrentGovernancePolicy();
    expect(values.same_type_max_streak).toBe(2);
    expect(values.passive_max_streak).toBe(2);
    expect(values.crowd_out_max_per_skill).toBe(2);
    expect(values.crowd_out_window).toBe(5);
    expect(values.stretch_cap_first_five).toBe(1);
    expect(values.daily_plan_target_minutes).toBe(999);
    expect(values.review_slot_share).toBe(1);
    expect(values.ai_pulse_slot_share).toBe(1);
  });

  it('fail-soft: getCurrentGovernancePolicy never throws even if no row exists yet (schema not initialized), degrading to the documented defaults', async () => {
    findOne.mockResolvedValue(null);
    const values = await getCurrentGovernancePolicy();
    expect(values).toEqual(DEFAULTS);
  });

  it('hardening: a row that resolves successfully but has an undefined/non-numeric field (malformed data, not a thrown error) falls back per-field to the safe default rather than propagating the bad value — a share field silently reading as undefined must NEVER be treated as falsy/0 (0 has real "never show this slot" meaning)', async () => {
    findOne.mockResolvedValue(makeCurrentRow({ review_slot_share: undefined, ai_pulse_slot_share: NaN, crowd_out_window: 'not-a-number' as any }));
    const values = await getCurrentGovernancePolicy();
    expect(values.review_slot_share).toBe(1);
    expect(values.ai_pulse_slot_share).toBe(1);
    expect(values.crowd_out_window).toBe(5);
    // Fields that WERE valid on this same malformed row still pass through untouched.
    expect(values.same_type_max_streak).toBe(2);
  });

  it('failure path: getCurrentGovernancePolicyRow (the admin-facing read) DOES throw GovernancePolicyNotFoundError when no row exists', async () => {
    findOne.mockResolvedValue(null);
    await expect(getCurrentGovernancePolicyRow()).rejects.toThrow(GovernancePolicyNotFoundError);
  });

  it('history: returns all versions ascending', async () => {
    findAll.mockResolvedValue([{ version: 1 }, { version: 2 }]);
    const result = await getGovernancePolicyHistory();
    expect(result).toHaveLength(2);
  });
});

describe('updateGovernancePolicy', () => {
  it('happy path: a real edit inserts version+1 and flips is_current on the old row', async () => {
    const current = makeCurrentRow();
    findOne.mockResolvedValue(current);
    create.mockResolvedValue({ version: 2, same_type_max_streak: 3 });

    const result = await updateGovernancePolicy({ same_type_max_streak: 3 }, 'admin-1');
    expect(result.versioned).toBe(true);
    expect(current.update).toHaveBeenCalledWith({ is_current: false }, expect.anything());
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ version: 2, same_type_max_streak: 3 }), expect.anything());
  });

  it('idempotency: a PUT identical to current values is a no-op — no new version, no update call', async () => {
    const current = makeCurrentRow();
    findOne.mockResolvedValue(current);

    const result = await updateGovernancePolicy({ ...DEFAULTS }, 'admin-1');
    expect(result.versioned).toBe(false);
    expect(result.policy).toBe(current);
    expect(create).not.toHaveBeenCalled();
    expect(current.update).not.toHaveBeenCalled();
  });

  it('boundary: a patch with only one changed field still versions correctly, preserving the other 7 fields from current', async () => {
    const current = makeCurrentRow();
    findOne.mockResolvedValue(current);
    create.mockResolvedValue({ version: 2 });

    await updateGovernancePolicy({ daily_plan_target_minutes: 30 }, 'admin-1');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ daily_plan_target_minutes: 30, same_type_max_streak: 2, crowd_out_window: 5 }),
      expect.anything(),
    );
  });

  it('failure path: no current row throws GovernancePolicyNotFoundError before any write', async () => {
    findOne.mockResolvedValue(null);
    await expect(updateGovernancePolicy({ same_type_max_streak: 3 })).rejects.toThrow(GovernancePolicyNotFoundError);
    expect(create).not.toHaveBeenCalled();
  });
});
