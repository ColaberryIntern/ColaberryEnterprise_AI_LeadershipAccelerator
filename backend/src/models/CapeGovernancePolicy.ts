import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CapeGovernancePolicy — CAPE Phase 6 (design doc §12 "Pacing controls", §16 Phase 6).
 * A single GLOBAL versioned settings row family (there is only ever one logical
 * setting, unlike CurriculumSkillMap's per-scope-key rows) covering the Stage 4
 * rerank caps that were previously plain module constants in
 * capeLearningValuePolicy.ts, plus the Today Plan pacing knobs previously implicit
 * in capeTodayPlanService.ts's fixed 5-slot structure.
 *
 * Only one row may have `is_current=true` at a time (partial unique index on
 * `is_current` alone — a global settings row has no scope key to pair it with).
 * Edits INSERT a new version and flip the prior row's `is_current` to false (see
 * capeGovernancePolicyService.ts) — same "insert-new-version" contract as every
 * other CAPE settings surface (ArchitectureSkillDefinition, CurriculumSkillMap).
 *
 * Default values (seeded by ensureCapeGovernanceSchema.ts on first run) are
 * BYTE-IDENTICAL to the hardcoded constants they replace, so shipping this table
 * changes nothing about live ranking/pacing behavior until an admin explicitly
 * edits a value through the Phase 6 governance board.
 */
export interface CapeGovernancePolicyAttributes {
  id?: string;
  version: number;
  is_current: boolean;
  /** Stage 4 (capeLearningValuePolicy.ts) — was SAME_TYPE_MAX_STREAK = 2 */
  same_type_max_streak: number;
  /** Stage 4 — was PASSIVE_MAX_STREAK = 2 */
  passive_max_streak: number;
  /** Stage 4 — was CROWD_OUT_MAX_PER_SKILL = 2 */
  crowd_out_max_per_skill: number;
  /** Stage 4 — was CROWD_OUT_WINDOW = 5 (also controls the stretch-cap-first-5
   * position boundary, previously 2 separate inline `position < 5` literals) */
  crowd_out_window: number;
  /** Stage 4 — was the inline literal `>= 1` in the stretch-cap check */
  stretch_cap_first_five: number;
  /** Today Plan (capeTodayPlanService.ts) — trims trailing slots when the
   * assembled plan's estimated_total_minutes exceeds this. Default 999 = never
   * triggers on any realistic real plan (unchanged behavior). */
  daily_plan_target_minutes: number;
  /** 0 = never include the review slot, >0 = attempt to fill it (deterministic,
   * not probabilistic — see execution-contract.md Assumption 3). Default 1. */
  review_slot_share: number;
  /** Same semantics as review_slot_share, for the ai_pulse slot. Default 1. */
  ai_pulse_slot_share: number;
  reason?: string | null;
  created_by?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class CapeGovernancePolicy extends Model<CapeGovernancePolicyAttributes>
  implements CapeGovernancePolicyAttributes {
  declare id: string;
  declare version: number;
  declare is_current: boolean;
  declare same_type_max_streak: number;
  declare passive_max_streak: number;
  declare crowd_out_max_per_skill: number;
  declare crowd_out_window: number;
  declare stretch_cap_first_five: number;
  declare daily_plan_target_minutes: number;
  declare review_slot_share: number;
  declare ai_pulse_slot_share: number;
  declare reason: string | null;
  declare created_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CapeGovernancePolicy.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    is_current: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    same_type_max_streak: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 2 },
    passive_max_streak: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 2 },
    crowd_out_max_per_skill: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 2 },
    crowd_out_window: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
    stretch_cap_first_five: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    daily_plan_target_minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 999 },
    // FLOAT (not DECIMAL) deliberately: node-postgres returns DECIMAL/NUMERIC as a
    // string to avoid float precision loss on financial data, which this is not —
    // these are 0..1 inclusion fractions, and callers (capeTodayPlanService.ts)
    // compare them numerically (`=== 0`), so a string type would silently break
    // that comparison. FLOAT round-trips as a real JS number.
    review_slot_share: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1 },
    ai_pulse_slot_share: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1 },
    reason: { type: DataTypes.STRING(500), allowNull: true },
    created_by: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'cape_governance_policy',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [{ fields: ['version'] }],
  }
);

export default CapeGovernancePolicy;
