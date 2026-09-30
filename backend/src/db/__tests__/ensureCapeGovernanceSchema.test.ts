/**
 * Static contract test for ensureCapeGovernanceSchema — asserts the SQL statement
 * array declares the 2 new tables with byte-identical-to-legacy-constant seed
 * defaults, WITHOUT requiring a live database (mocked sequelize.query, same
 * convention as ensureCapeCurriculumMapSchema.test.ts).
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import { ensureCapeGovernanceSchema } from '../ensureCapeGovernanceSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureCapeGovernanceSchema', () => {
  it('happy path: creates cape_governance_policy and cape_lifecycle_mode_policy tables', async () => {
    await ensureCapeGovernanceSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));

    expect(statements.some((s) => /CREATE TABLE IF NOT EXISTS cape_governance_policy/.test(s))).toBe(true);
    expect(statements.some((s) => /CREATE TABLE IF NOT EXISTS cape_lifecycle_mode_policy/.test(s))).toBe(true);
  });

  it('boundary: declares a partial-unique index so only one is_current governance-policy row can exist globally', async () => {
    await ensureCapeGovernanceSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(statements.some((s) => /idx_cape_governance_policy_current.*ON cape_governance_policy \(is_current\) WHERE is_current/.test(s))).toBe(true);
  });

  it('boundary: declares a partial-unique index per mode so only one is_current lifecycle-mode-policy row per mode can exist', async () => {
    await ensureCapeGovernanceSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(statements.some((s) => /idx_cape_lifecycle_mode_policy_current.*ON cape_lifecycle_mode_policy \(mode\) WHERE is_current/.test(s))).toBe(true);
  });

  it('seeds the governance policy row with values byte-identical to the prior hardcoded constants (2/2/2/5/1/999/1/1) when none exists yet', async () => {
    await ensureCapeGovernanceSchema();
    const insertCall = mockQuery.mock.calls.find((c) => /INSERT INTO cape_governance_policy/.test(String(c[0])));
    expect(insertCall).toBeDefined();
    const replacements = insertCall![1]?.replacements;
    expect(replacements).toEqual({
      same_type_max_streak: 2,
      passive_max_streak: 2,
      crowd_out_max_per_skill: 2,
      crowd_out_window: 5,
      stretch_cap_first_five: 1,
      daily_plan_target_minutes: 999,
      review_slot_share: 1,
      ai_pulse_slot_share: 1,
    });
  });

  it('seeds exactly 5 lifecycle-mode-policy rows, one per LifecycleMode, when none exist yet', async () => {
    await ensureCapeGovernanceSchema();
    const insertCalls = mockQuery.mock.calls.filter((c) => /INSERT INTO cape_lifecycle_mode_policy/.test(String(c[0])));
    const modes = insertCalls.map((c) => c[1]?.replacements?.mode).sort();
    expect(modes).toEqual([
      'active_builder', 'architect_track', 'experienced_cold_start', 'foundation', 'returning_after_absence',
    ]);
  });

  it('seeds returning_after_absence as an explicit first-cut even split, not a fabricated design-doc number', async () => {
    await ensureCapeGovernanceSchema();
    const insertCalls = mockQuery.mock.calls.filter((c) => /INSERT INTO cape_lifecycle_mode_policy/.test(String(c[0])));
    const returningInsert = insertCalls.find((c) => c[1]?.replacements?.mode === 'returning_after_absence');
    expect(returningInsert).toBeDefined();
    const mix = JSON.parse(returningInsert![1]!.replacements!.mix);
    expect(mix).toEqual({ gentle_restart: 0.34, review: 0.33, next_action: 0.33 });
    expect(String(returningInsert![1]!.replacements!.reason)).toMatch(/no numeric split/i);
  });

  it('does NOT re-seed (would silently reset an admin edit) when a current row already exists', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (/^SELECT id FROM cape_governance_policy/.test(sql)) return Promise.resolve([{ id: 'existing-row' }]);
      if (/^SELECT id FROM cape_lifecycle_mode_policy/.test(sql)) return Promise.resolve([{ id: 'existing-row' }]);
      return Promise.resolve([]);
    });
    await ensureCapeGovernanceSchema();
    const insertCalls = mockQuery.mock.calls.filter((c) => /^INSERT INTO cape_/.test(String(c[0])));
    expect(insertCalls.length).toBe(0);
  });

  it('idempotency: a statement failure does not stop the remaining statements from running', async () => {
    mockQuery.mockRejectedValueOnce(new Error('already exists')).mockResolvedValue([]);
    await expect(ensureCapeGovernanceSchema()).resolves.toBeUndefined();
    expect(mockQuery.mock.calls.length).toBeGreaterThan(5);
  });

  it('never touches any existing table (additive-only, no ALTER/UPDATE against a pre-existing table)', async () => {
    await ensureCapeGovernanceSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    const touchesExisting = statements.some((s) =>
      /\b(today_feed_impressions|curriculum_skill_maps|architecture_skill_definitions|student_skill_evidence|enrollments)\b/.test(s));
    expect(touchesExisting).toBe(false);
  });
});
