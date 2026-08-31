import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type AgentReportRunStatus = 'pending' | 'sent' | 'failed';

/**
 * AgentReportRun — one attempt to generate and deliver a single
 * AgentReportSubscription's report for one delivery period. Per
 * REPORTING_MAP.md's proposed shape, extended with `period_key` and
 * `error_message`:
 *
 * `period_key` is the real idempotency key (Idempotency & Replayability,
 * CLAUDE.md): 'YYYY-MM-DD' for a daily subscription, 'YYYY-Www' (ISO
 * week) for weekly, computed from the subscription's own timezone at
 * dispatch time. The unique index on (subscription_id, period_key) is
 * DB-enforced, not just app-checked — two concurrent dispatch ticks (or a
 * retried tick) cannot both win the insert for the same period, so a
 * subscription can never be sent twice for one period no matter how the
 * cron fires.
 *
 * `content_snapshot` is what was actually included in the sent report —
 * a real audit/replay record, mirroring `DepartmentReport`'s existing
 * persisted-content pattern, never re-derived after the fact.
 */
export interface AgentReportRunAttributes {
  id?: string;
  subscription_id: string;
  period_key: string;
  generated_at?: Date;
  delivered_at?: Date | null;
  delivery_status?: AgentReportRunStatus;
  content_snapshot?: Record<string, unknown> | null;
  error_message?: string | null;
}

class AgentReportRun extends Model<AgentReportRunAttributes> implements AgentReportRunAttributes {
  declare id: string;
  declare subscription_id: string;
  declare period_key: string;
  declare generated_at: Date;
  declare delivered_at: Date | null;
  declare delivery_status: AgentReportRunStatus;
  declare content_snapshot: Record<string, unknown> | null;
  declare error_message: string | null;
}

AgentReportRun.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    subscription_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'agent_report_subscriptions', key: 'id' },
    },
    period_key: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    generated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    delivered_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    delivery_status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    content_snapshot: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'agent_report_runs',
    timestamps: false,
    underscored: true,
    indexes: [
      { unique: true, fields: ['subscription_id', 'period_key'], name: 'agent_report_runs_sub_period_unique' },
      { fields: ['subscription_id'], name: 'idx_agent_report_runs_subscription' },
    ],
  }
);

export default AgentReportRun;
