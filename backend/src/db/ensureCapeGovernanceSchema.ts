import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CAPE (Colaberry Adaptive Path Engine) Phase 6 schema — the Feed Control
 * governance board's own settings tables (design doc §12, §16 Phase 6). Same
 * idempotent-raw-SQL pattern as every prior CAPE ensure*Schema.ts — every
 * statement is CREATE ... IF NOT EXISTS, wrapped in its own try/catch so a
 * partial DB self-heals and re-running boot is a no-op. This repo does NOT run
 * global sequelize.sync({alter:true}) at boot.
 *
 * Two new tables, both additive-only, neither touches any existing table:
 *   - cape_governance_policy: ONE global versioned settings row family (Stage 4
 *     rerank caps + Today Plan pacing knobs). Seeded on first run with values
 *     BYTE-IDENTICAL to the hardcoded constants they replace
 *     (capeLearningValuePolicy.ts's SAME_TYPE_MAX_STREAK=2/PASSIVE_MAX_STREAK=2/
 *     CROWD_OUT_MAX_PER_SKILL=2/CROWD_OUT_WINDOW=5/stretch-cap-literal=1, plus a
 *     daily_plan_target_minutes=999 and slot shares=1 that reproduce
 *     capeTodayPlanService.ts's current unconditional behavior exactly) — so
 *     shipping this table changes NOTHING about live ranking/pacing behavior
 *     until an admin explicitly edits a value through the governance board.
 *   - cape_lifecycle_mode_policy: ONE versioned row per LifecycleMode (5 modes),
 *     seeded with design doc §10's recommended mix percentages for the 4 modes
 *     that have a real numeric split; `returning_after_absence` (which §10 only
 *     describes qualitatively — "one gentle restart, one review, one next
 *     action") is seeded as an explicit, logged first-cut even split
 *     (34/33/33), not a §10 number. This mix is NOT consumed by any live
 *     ranking/selection logic in this phase (view+versioned-edit only — see
 *     execution-contract.md Out-of-scope), so the seed choice carries zero
 *     production risk either way.
 *
 * MUST run AFTER ensureCapeTodayPlanSchema() in server.ts (matches this file
 * family's existing ordering convention; no hard FK dependency exists, but this
 * keeps CAPE phase ordering consistent and predictable in server.ts's boot log).
 */

const GOVERNANCE_POLICY_DEFAULTS = {
  same_type_max_streak: 2,
  passive_max_streak: 2,
  crowd_out_max_per_skill: 2,
  crowd_out_window: 5,
  stretch_cap_first_five: 1,
  daily_plan_target_minutes: 999,
  review_slot_share: 1,
  ai_pulse_slot_share: 1,
};

// design doc §10 "Lifecycle mixes" table. 4 of 5 rows are real §10 percentages;
// returning_after_absence has no numeric split in §10 (qualitative text only) —
// seeded as an explicit first-cut even split, flagged here and in handoff.md.
const LIFECYCLE_MODE_MIX_DEFAULTS: Record<string, Record<string, number>> = {
  foundation: { foundation: 0.60, guided_practice: 0.15, ai_pulse_motivation: 0.15, community_exploration: 0.10 },
  experienced_cold_start: { bridge_diagnostic: 0.30, skill_gap_learning: 0.35, ai_pulse: 0.20, exploration_community: 0.15 },
  active_builder: { classroom_project: 0.35, targeted_learning: 0.25, review: 0.15, ai_pulse: 0.15, community: 0.10 },
  architect_track: { advanced_builds_design_review: 0.30, ai_pulse: 0.25, weak_skill_closure: 0.20, governance_operations: 0.15, community_leadership: 0.10 },
  // NOT a §10 percentage — first-cut even split, see file header comment.
  returning_after_absence: { gentle_restart: 0.34, review: 0.33, next_action: 0.33 },
};

export async function ensureCapeGovernanceSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS cape_governance_policy (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       version INTEGER NOT NULL DEFAULT 1,
       is_current BOOLEAN NOT NULL DEFAULT true,
       same_type_max_streak INTEGER NOT NULL DEFAULT 2,
       passive_max_streak INTEGER NOT NULL DEFAULT 2,
       crowd_out_max_per_skill INTEGER NOT NULL DEFAULT 2,
       crowd_out_window INTEGER NOT NULL DEFAULT 5,
       stretch_cap_first_five INTEGER NOT NULL DEFAULT 1,
       daily_plan_target_minutes INTEGER NOT NULL DEFAULT 999,
       review_slot_share DOUBLE PRECISION NOT NULL DEFAULT 1,
       ai_pulse_slot_share DOUBLE PRECISION NOT NULL DEFAULT 1,
       reason VARCHAR(500),
       created_by VARCHAR(255),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // Only one global row may be current at a time — partial unique index on
    // is_current alone (all indexed rows share value=true, so a 2nd violates it).
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_cape_governance_policy_current ON cape_governance_policy (is_current) WHERE is_current`,

    `CREATE TABLE IF NOT EXISTS cape_lifecycle_mode_policy (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       mode VARCHAR(40) NOT NULL,
       version INTEGER NOT NULL DEFAULT 1,
       is_current BOOLEAN NOT NULL DEFAULT true,
       mix JSONB NOT NULL DEFAULT '{}'::jsonb,
       reason VARCHAR(500),
       created_by VARCHAR(255),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_cape_lifecycle_mode_policy_current ON cape_lifecycle_mode_policy (mode) WHERE is_current`,
    `CREATE INDEX IF NOT EXISTS idx_cape_lifecycle_mode_policy_mode ON cape_lifecycle_mode_policy (mode)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] CAPE governance schema stmt skipped:', err?.message);
    }
  }

  // Seed the single global governance-policy row, only if none exists yet
  // (idempotent — a re-run after an admin has already edited it must never
  // reset their change back to defaults).
  try {
    const rows = await sequelize.query<{ id: string }>(
      `SELECT id FROM cape_governance_policy WHERE is_current = true LIMIT 1`,
      { type: QueryTypes.SELECT },
    );
    if (!rows[0]) {
      const d = GOVERNANCE_POLICY_DEFAULTS;
      await sequelize.query(
        `INSERT INTO cape_governance_policy
           (version, is_current, same_type_max_streak, passive_max_streak, crowd_out_max_per_skill,
            crowd_out_window, stretch_cap_first_five, daily_plan_target_minutes, review_slot_share,
            ai_pulse_slot_share, reason, created_by)
         VALUES (1, true, :same_type_max_streak, :passive_max_streak, :crowd_out_max_per_skill,
            :crowd_out_window, :stretch_cap_first_five, :daily_plan_target_minutes, :review_slot_share,
            :ai_pulse_slot_share, 'CAPE Phase 6 seed — byte-identical to prior hardcoded constants', NULL)`,
        { replacements: d },
      );
      console.log('[DB] CAPE governance policy seeded with defaults matching prior hardcoded constants');
    }
  } catch (err: any) {
    console.warn('[DB] CAPE governance policy seed skipped:', err?.message);
  }

  // Seed the 5 lifecycle-mode-policy rows, only for modes with no current row yet.
  try {
    for (const [mode, mix] of Object.entries(LIFECYCLE_MODE_MIX_DEFAULTS)) {
      const rows = await sequelize.query<{ id: string }>(
        `SELECT id FROM cape_lifecycle_mode_policy WHERE mode = :mode AND is_current = true LIMIT 1`,
        { replacements: { mode }, type: QueryTypes.SELECT },
      );
      if (!rows[0]) {
        await sequelize.query(
          `INSERT INTO cape_lifecycle_mode_policy (mode, version, is_current, mix, reason, created_by)
           VALUES (:mode, 1, true, :mix, :reason, NULL)`,
          {
            replacements: {
              mode,
              mix: JSON.stringify(mix),
              reason: mode === 'returning_after_absence'
                ? 'CAPE Phase 6 seed — first-cut even split, design doc §10 gives no numeric split for this mode'
                : 'CAPE Phase 6 seed — design doc §10 recommended mix',
            },
          },
        );
      }
    }
    console.log('[DB] CAPE lifecycle-mode policy seeded (5 modes)');
  } catch (err: any) {
    console.warn('[DB] CAPE lifecycle-mode policy seed skipped:', err?.message);
  }

  console.log('[DB] CAPE (Adaptive Path Engine) Phase 6 governance schema ensured');
}
