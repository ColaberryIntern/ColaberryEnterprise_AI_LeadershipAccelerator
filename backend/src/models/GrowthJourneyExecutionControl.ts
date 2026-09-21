import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * GrowthJourneyExecutionControl — the operator's switchboard for governed
 * execution (§14 rollout modes; Phase 5 T503).
 *
 * ─── TWO KINDS OF ROW ───────────────────────────────────────────────────────
 *
 *   rollout  raises ONE brand × programme × channel to `review` or `limited`.
 *            A `limited` rollout must name its cohort and a daily limit — the
 *            DDL's CHECK refuses one that does not, so "bounded" is the
 *            database's rule rather than a caller's good manners.
 *   pause    lowers a brand, a programme, a channel or a single subject to
 *            `off`. A pause can only ever narrow what is already permitted.
 *
 * ─── THERE IS NO GLOBAL SCOPE HERE ──────────────────────────────────────────
 *
 * The global stop is the EXISTING `system_kill_switch`, read first and read
 * strictly. A journey-wide pause row would be a second global switch that could
 * silently disagree with it, which §14 forbids; `scopeKey` refuses to build one.
 *
 * ─── ROWS ARE CLEARED, NEVER EDITED ─────────────────────────────────────────
 *
 * Changing a control means clearing the active row (`cleared_at`, `cleared_by_admin_id`)
 * and writing a new one, so who paused what, and when, survives the change. The
 * partial unique on `scope_key` keeps exactly one active control per scope.
 */

export type GrowthJourneyControlKind = 'rollout' | 'pause';

/** A rollout raises to `review` or `limited`; a pause is always `off`. */
export type GrowthJourneyControlMode = 'review' | 'limited' | 'off';

export interface GrowthJourneyExecutionControlAttributes {
  id?: string;
  tenant_id: string;
  kind: GrowthJourneyControlKind;
  /** The canonical key for this scope, built by `execution/scopeKey.ts` — one active row per key. */
  scope_key: string;
  /** Nullable ONLY here in this run: a pause may be programme- or channel-wide across brands. */
  brand_id?: string | null;
  program_id?: string | null;
  channel?: string | null;
  subject_ref?: string | null;
  mode: GrowthJourneyControlMode;
  cohort_lead_ids?: number[] | null;
  daily_limit?: number | null;
  reason?: string | null;
  set_by_admin_id?: string | null;
  created_at?: Date;
  cleared_at?: Date | null;
  cleared_by_admin_id?: string | null;
}

class GrowthJourneyExecutionControl
  extends Model<GrowthJourneyExecutionControlAttributes>
  implements GrowthJourneyExecutionControlAttributes
{
  declare id: string;
  declare tenant_id: string;
  declare kind: GrowthJourneyControlKind;
  declare scope_key: string;
  declare brand_id: string | null;
  declare program_id: string | null;
  declare channel: string | null;
  declare subject_ref: string | null;
  declare mode: GrowthJourneyControlMode;
  declare cohort_lead_ids: number[] | null;
  declare daily_limit: number | null;
  declare reason: string | null;
  declare set_by_admin_id: string | null;
  declare created_at: Date;
  declare cleared_at: Date | null;
  declare cleared_by_admin_id: string | null;
}

GrowthJourneyExecutionControl.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    kind: { type: DataTypes.STRING(8), allowNull: false },
    scope_key: { type: DataTypes.TEXT, allowNull: false },
    brand_id: { type: DataTypes.UUID, allowNull: true },
    program_id: { type: DataTypes.UUID, allowNull: true },
    channel: { type: DataTypes.STRING(16), allowNull: true },
    subject_ref: { type: DataTypes.STRING(128), allowNull: true },
    mode: { type: DataTypes.STRING(8), allowNull: false },
    cohort_lead_ids: { type: DataTypes.ARRAY(DataTypes.INTEGER), allowNull: true },
    daily_limit: { type: DataTypes.INTEGER, allowNull: true },
    reason: { type: DataTypes.TEXT, allowNull: true },
    set_by_admin_id: { type: DataTypes.STRING(128), allowNull: true },
    cleared_at: { type: DataTypes.DATE, allowNull: true },
    cleared_by_admin_id: { type: DataTypes.STRING(128), allowNull: true },
  },
  {
    sequelize,
    tableName: 'growth_journey_execution_controls',
    // A control row is written once and cleared; there is no `updated_at` to maintain.
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  },
);

export default GrowthJourneyExecutionControl;
