import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { LifecycleMode } from '../services/cape/capeLifecycleModeService';

/**
 * CapeLifecycleModePolicy — CAPE Phase 6 (design doc §10 "Lifecycle mixes" table,
 * §12 "Learner-stage policies", §16 Phase 6). One versioned row family PER
 * `mode` (the same 5 `LifecycleMode` values capeLifecycleModeService.ts already
 * classifies learners into — reused, not redefined, here).
 *
 * `mix` is a free-form JSONB `Record<string, number>` because each mode's
 * category set differs (design doc §10's table has different column labels per
 * row — e.g. Foundation's "foundation/guided_practice/ai_pulse_motivation/
 * community_exploration" vs Architect track's "advanced_builds/ai_pulse/
 * weak_skill_closure/governance_operations/community_leadership"). Values must
 * sum to ~1.0 (enforced by capeSchema.ts's updateLifecycleModeMixSchema, not
 * at the DB layer — same pattern as evidence-band weights).
 *
 * NOT currently consumed by any live ranking/selection logic — this is a
 * governable, versioned, view+edit surface only in this phase (see
 * execution-contract.md Out-of-scope: capeLifecycleModeService.ts's own doc
 * comment already flags full weighted-mix consumption as a future iteration).
 * Only one row per `mode` may have `is_current=true` at a time.
 */
export interface CapeLifecycleModePolicyAttributes {
  id?: string;
  mode: LifecycleMode;
  version: number;
  is_current: boolean;
  mix: Record<string, number>;
  reason?: string | null;
  created_by?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class CapeLifecycleModePolicy extends Model<CapeLifecycleModePolicyAttributes>
  implements CapeLifecycleModePolicyAttributes {
  declare id: string;
  declare mode: LifecycleMode;
  declare version: number;
  declare is_current: boolean;
  declare mix: Record<string, number>;
  declare reason: string | null;
  declare created_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CapeLifecycleModePolicy.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    mode: { type: DataTypes.STRING(40), allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    is_current: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    mix: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    reason: { type: DataTypes.STRING(500), allowNull: true },
    created_by: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'cape_lifecycle_mode_policy',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['mode', 'version'] },
      { fields: ['mode'] },
    ],
  }
);

export default CapeLifecycleModePolicy;
