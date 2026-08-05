import CapeLifecycleModePolicy from '../../../models/CapeLifecycleModePolicy';
import {
  listCurrentLifecycleModePolicies, getLifecycleModePolicyHistory, updateLifecycleModeMix,
  LifecycleModePolicyNotFoundError, ALL_LIFECYCLE_MODES,
} from '../capeLifecycleModePolicyService';
import { updateLifecycleModeMixSchema } from '../../../schemas/capeSchema';

jest.mock('../../../config/database', () => ({
  sequelize: { transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn({})) },
}));
jest.mock('../../../models/CapeLifecycleModePolicy', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() },
}));

const findOne = CapeLifecycleModePolicy.findOne as unknown as jest.Mock;
const findAll = CapeLifecycleModePolicy.findAll as unknown as jest.Mock;
const create = CapeLifecycleModePolicy.create as unknown as jest.Mock;

// design doc §10's 4 real numeric rows, plus returning_after_absence's documented
// first-cut even split (T001's seed — see ensureCapeGovernanceSchema.ts).
const SEEDED_MIXES: Record<string, Record<string, number>> = {
  foundation: { foundation: 0.60, guided_practice: 0.15, ai_pulse_motivation: 0.15, community_exploration: 0.10 },
  experienced_cold_start: { bridge_diagnostic: 0.30, skill_gap_learning: 0.35, ai_pulse: 0.20, exploration_community: 0.15 },
  active_builder: { classroom_project: 0.35, targeted_learning: 0.25, review: 0.15, ai_pulse: 0.15, community: 0.10 },
  architect_track: { advanced_builds_design_review: 0.30, ai_pulse: 0.25, weak_skill_closure: 0.20, governance_operations: 0.15, community_leadership: 0.10 },
  returning_after_absence: { gentle_restart: 0.34, review: 0.33, next_action: 0.33 },
};

function makeCurrentRow(mode: string, overrides: Record<string, any> = {}) {
  const state: Record<string, any> = { id: `m-${mode}`, mode, version: 1, is_current: true, mix: SEEDED_MIXES[mode], reason: null, created_by: null, ...overrides };
  state.update = jest.fn(async (patch: Record<string, any>) => { Object.assign(state, patch); return state; });
  return state;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listCurrentLifecycleModePolicies / getLifecycleModePolicyHistory', () => {
  it('happy path: lists all 5 seeded modes with the design doc §10 mix values', async () => {
    findAll.mockResolvedValue(ALL_LIFECYCLE_MODES.map((m) => makeCurrentRow(m)));
    const result = await listCurrentLifecycleModePolicies();
    expect(result).toHaveLength(5);
    const foundation = result.find((r: any) => r.mode === 'foundation');
    expect(foundation!.mix).toEqual({ foundation: 0.60, guided_practice: 0.15, ai_pulse_motivation: 0.15, community_exploration: 0.10 });
  });

  it('matches the 4 modes design doc §10 gives a real numeric split for, exactly', async () => {
    findAll.mockResolvedValue(ALL_LIFECYCLE_MODES.map((m) => makeCurrentRow(m)));
    const result = await listCurrentLifecycleModePolicies();
    for (const mode of ['foundation', 'experienced_cold_start', 'active_builder', 'architect_track']) {
      const row = result.find((r: any) => r.mode === mode)!;
      const sum = Object.values(row.mix as Record<string, number>).reduce((s, v) => s + v, 0);
      expect(sum).toBeCloseTo(1.0, 3);
    }
  });

  it('returning_after_absence matches the documented first-cut even split, not a fabricated §10 number', async () => {
    findAll.mockResolvedValue(ALL_LIFECYCLE_MODES.map((m) => makeCurrentRow(m)));
    const result = await listCurrentLifecycleModePolicies();
    const returning = result.find((r: any) => r.mode === 'returning_after_absence')!;
    expect(returning.mix).toEqual({ gentle_restart: 0.34, review: 0.33, next_action: 0.33 });
  });

  it('history returns all versions ascending for one mode', async () => {
    findAll.mockResolvedValue([{ version: 1 }, { version: 2 }]);
    const result = await getLifecycleModePolicyHistory('foundation');
    expect(result).toHaveLength(2);
  });
});

describe('updateLifecycleModeMixSchema (Zod layer)', () => {
  it('rejects a mix that does not sum to 1.0', () => {
    const result = updateLifecycleModeMixSchema.safeParse({ mix: { foundation: 0.5, guided_practice: 0.2 } });
    expect(result.success).toBe(false);
  });

  it('accepts a mix summing to 1.0 within the ±0.001 tolerance', () => {
    const result = updateLifecycleModeMixSchema.safeParse({ mix: { foundation: 0.6, guided_practice: 0.15, ai_pulse_motivation: 0.15, community_exploration: 0.1001 } });
    expect(result.success).toBe(true);
  });

  it('rejects an empty mix', () => {
    const result = updateLifecycleModeMixSchema.safeParse({ mix: {} });
    expect(result.success).toBe(false);
  });
});

describe('updateLifecycleModeMix', () => {
  it('happy path: a real mix edit inserts version+1 and flips is_current on the old row', async () => {
    const current = makeCurrentRow('foundation');
    findOne.mockResolvedValue(current);
    const newMix = { foundation: 0.50, guided_practice: 0.20, ai_pulse_motivation: 0.20, community_exploration: 0.10 };
    create.mockResolvedValue({ mode: 'foundation', version: 2, mix: newMix });

    const result = await updateLifecycleModeMix('foundation', { mix: newMix }, 'admin-1');
    expect(result.versioned).toBe(true);
    expect(current.update).toHaveBeenCalledWith({ is_current: false }, expect.anything());
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ mode: 'foundation', version: 2, mix: newMix }), expect.anything());
  });

  it('idempotency: a PUT with an identical mix is a no-op — no new version, no update call', async () => {
    const current = makeCurrentRow('foundation');
    findOne.mockResolvedValue(current);

    const result = await updateLifecycleModeMix('foundation', { mix: { ...SEEDED_MIXES.foundation } }, 'admin-1');
    expect(result.versioned).toBe(false);
    expect(result.policy).toBe(current);
    expect(create).not.toHaveBeenCalled();
    expect(current.update).not.toHaveBeenCalled();
  });

  it('a mix with different category keys (not just different values) is treated as a real change', async () => {
    const current = makeCurrentRow('foundation');
    findOne.mockResolvedValue(current);
    create.mockResolvedValue({ version: 2 });

    const differentKeys = { foundation: 0.70, everything_else: 0.30 };
    const result = await updateLifecycleModeMix('foundation', { mix: differentKeys }, 'admin-1');
    expect(result.versioned).toBe(true);
  });

  it('failure path: unknown mode throws LifecycleModePolicyNotFoundError before any write', async () => {
    findOne.mockResolvedValue(null);
    await expect(updateLifecycleModeMix('foundation', { mix: { a: 1 } })).rejects.toThrow(LifecycleModePolicyNotFoundError);
    expect(create).not.toHaveBeenCalled();
  });
});
