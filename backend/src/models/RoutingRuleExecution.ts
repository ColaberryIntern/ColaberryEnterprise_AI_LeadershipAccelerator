import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * RoutingRuleExecution — one row per routing action the engine attempted for
 * one payload (Phase 2, T226). The audit trail the routing engine never had.
 *
 * Lifecycle of a row: `claimed` (inserted BEFORE the handler runs; the unique
 * index on `(raw_payload_id, rule_id, action_index)` makes a replay lose the
 * insert and skip) → one of `ok` | `failed` | `unknown` | `deferred`. A row
 * that stays `claimed` is a crash between claim and finish, visible as such.
 *
 * `deferred` is Phase 2's honesty status: an action that WOULD contact someone
 * or create an account is recorded with what it would have done and why it did
 * not (`detail.deferred_reason`), never reported as `ok`.
 */

export type RoutingRuleExecutionStatus = 'claimed' | 'ok' | 'failed' | 'unknown' | 'deferred';

export interface RoutingRuleExecutionAttributes {
  id?: string;
  raw_payload_id: string;
  lead_id: number;
  rule_id: string;
  rule_version: number;
  action_index: number;
  action_type: string;
  action_snapshot: Record<string, unknown>;
  status: RoutingRuleExecutionStatus;
  detail?: Record<string, unknown> | null;
  error_class?: string | null;
  tenant_id?: string | null;
  brand_id?: string | null;
  created_at?: Date;
  finished_at?: Date | null;
}

export class RoutingRuleExecution
  extends Model<RoutingRuleExecutionAttributes>
  implements RoutingRuleExecutionAttributes
{
  declare id: string;
  declare raw_payload_id: string;
  declare lead_id: number;
  declare rule_id: string;
  declare rule_version: number;
  declare action_index: number;
  declare action_type: string;
  declare action_snapshot: Record<string, unknown>;
  declare status: RoutingRuleExecutionStatus;
  declare detail: Record<string, unknown> | null;
  declare error_class: string | null;
  declare tenant_id: string | null;
  declare brand_id: string | null;
  declare readonly created_at: Date;
  declare finished_at: Date | null;
}

RoutingRuleExecution.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Not foreign keys, on purpose — see the DDL header.
    raw_payload_id: { type: DataTypes.UUID, allowNull: false },
    lead_id: { type: DataTypes.INTEGER, allowNull: false },
    rule_id: { type: DataTypes.UUID, allowNull: false },
    rule_version: { type: DataTypes.INTEGER, allowNull: false },
    action_index: { type: DataTypes.SMALLINT, allowNull: false },
    action_type: { type: DataTypes.TEXT, allowNull: false },
    action_snapshot: { type: DataTypes.JSONB, allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false },
    detail: { type: DataTypes.JSONB, allowNull: true },
    error_class: { type: DataTypes.TEXT, allowNull: true },
    tenant_id: { type: DataTypes.UUID, allowNull: true },
    brand_id: { type: DataTypes.UUID, allowNull: true },
    finished_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'routing_rule_executions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        unique: true,
        name: 'routing_rule_executions_payload_rule_action_unique',
        fields: ['raw_payload_id', 'rule_id', 'action_index'],
      },
    ],
  },
);

export default RoutingRuleExecution;
