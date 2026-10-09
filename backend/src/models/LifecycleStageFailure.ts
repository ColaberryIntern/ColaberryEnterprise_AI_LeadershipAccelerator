import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Dead-letter for a stage command that exhausted its capped retries.
 *
 * A retry cap without somewhere for the final failure to land is just silent loss. This row is
 * where a stage command goes after its last attempt, carrying enough context to triage it by
 * hand: which stage was attempted, how many attempts were spent, the stable `error_class`, and
 * the `correlation_id` that ties it back to the log lines for the whole attempt chain.
 *
 * `error_class` is a stable string (`TimeoutError`, `RateLimitError`, `ValidationError`,
 * `UpstreamUnavailable`, `ContractViolation`, …), never a bare `Error` — a generic class in here
 * means the surrounding code needs a more specific catch.
 *
 * Writing one of these NEVER advances the lifecycle stage. A model or tool failure may leave a
 * recoverable draft behind, but it must not move an approved stage forward.
 *
 * Schema: db/ensureProjectLifecycleSchema.ts.
 */
export interface LifecycleStageFailureAttributes {
  id?: string;
  tenant_id: string;
  lifecycle_state_id?: string | null;
  attempted_stage: string;
  attempts: number;
  error_class?: string | null;
  error_message?: string | null;
  correlation_id?: string | null;
  context_json?: unknown | null;
  created_at?: Date;
}

class LifecycleStageFailure extends Model<LifecycleStageFailureAttributes> implements LifecycleStageFailureAttributes {
  declare id: string;
  declare tenant_id: string;
  declare lifecycle_state_id: string | null;
  declare attempted_stage: string;
  declare attempts: number;
  declare error_class: string | null;
  declare error_message: string | null;
  declare correlation_id: string | null;
  declare context_json: unknown | null;
  declare created_at: Date;
}

LifecycleStageFailure.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    lifecycle_state_id: { type: DataTypes.UUID, allowNull: true },
    attempted_stage: { type: DataTypes.TEXT, allowNull: false },
    attempts: { type: DataTypes.INTEGER, allowNull: false },
    error_class: { type: DataTypes.TEXT, allowNull: true },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    correlation_id: { type: DataTypes.TEXT, allowNull: true },
    context_json: { type: DataTypes.JSONB, allowNull: true },
  },
  { sequelize, tableName: 'lifecycle_stage_failures', timestamps: true, updatedAt: false, underscored: true },
);

export default LifecycleStageFailure;
