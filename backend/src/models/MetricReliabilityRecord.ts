import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type MetricReliabilityStatus = 'healthy' | 'degraded' | 'quarantined' | 'recovering';
export type MetricReliabilitySeverity = 'low' | 'medium' | 'high' | 'critical';
export type MetricReliabilityDeclaredBySource = 'manager_report' | 'agent_detection' | 'automated_monitor';
export type MetricReliabilityScopeType = 'global' | 'cohort' | 'student' | 'time_range';

/**
 * MetricReliabilityRecord — Reese Agentic AI Employee mission, Checkpoint B.
 * Confirmed absent anywhere in this codebase at Checkpoint A discovery
 * (docs/reese-agentic-employee/CHECKPOINT_A_DISCOVERY.md, §5.5): nothing
 * marks a data source unreliable and has that marking actually remove it
 * from a decision. This is that mechanism.
 *
 * ABSENCE OF A ROW MEANS HEALTHY — never fabricate a positive "all clear"
 * row for a source nobody has ever declared a problem with. A row exists
 * only once something has genuinely been reported degraded/quarantined at
 * least once (see metricReliabilityService.ts's getReliabilityStatus()).
 *
 * One row per (source_system, metric_key, scope_type, scope_value) MUTATES
 * IN PLACE across its lifecycle (open -> recovering -> healthy), the same
 * convention Ticket.status uses — fast current-state lookup, not a new row
 * per transition. The immutable audit trail lives in AiEvent
 * (event_type: 'metric.quarantined' | 'metric.restored' | 'metric.degraded'),
 * matching this repo's existing append-only event pipeline rather than a
 * second, parallel audit table.
 *
 * No DB-level uniqueness constraint on the (source_system, metric_key,
 * scope_type, scope_value) tuple — matches this repo's established
 * convention of no unique/FK enforcement on actor-ref-shaped columns
 * (AiAgent.reports_to_id, etc.). Concurrency safety for "one active record
 * per scope" is a service-layer findOrCreate concern, not a DB one — real
 * declarations are human-paced, not high-frequency.
 */
export interface MetricReliabilityRecordAttributes {
  id?: string;
  source_system: string;
  metric_key: string;
  scope_type: MetricReliabilityScopeType;
  scope_value: string | null;
  status: MetricReliabilityStatus;
  severity: MetricReliabilitySeverity | null;
  reason: string;
  incident_ticket_id?: string | null;
  declared_by_source: MetricReliabilityDeclaredBySource;
  declared_by_email: string | null;
  declared_at: Date;
  review_owner_email?: string | null;
  next_review_at?: Date | null;
  recovery_criteria?: string | null;
  restored_by_email?: string | null;
  restored_at?: Date | null;
}

class MetricReliabilityRecord extends Model<MetricReliabilityRecordAttributes> implements MetricReliabilityRecordAttributes {
  declare id: string;
  declare source_system: string;
  declare metric_key: string;
  declare scope_type: MetricReliabilityScopeType;
  declare scope_value: string | null;
  declare status: MetricReliabilityStatus;
  declare severity: MetricReliabilitySeverity | null;
  declare reason: string;
  declare incident_ticket_id: string | null;
  declare declared_by_source: MetricReliabilityDeclaredBySource;
  declare declared_by_email: string | null;
  declare declared_at: Date;
  declare review_owner_email: string | null;
  declare next_review_at: Date | null;
  declare recovery_criteria: string | null;
  declare restored_by_email: string | null;
  declare restored_at: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

MetricReliabilityRecord.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    source_system: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    metric_key: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    scope_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'global',
    },
    scope_value: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'degraded',
    },
    severity: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    incident_ticket_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    declared_by_source: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    declared_by_email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    declared_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    review_owner_email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    next_review_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    recovery_criteria: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    restored_by_email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    restored_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'metric_reliability_records',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['source_system', 'metric_key', 'status'], name: 'idx_metric_reliability_lookup' },
    ],
  }
);

export default MetricReliabilityRecord;
