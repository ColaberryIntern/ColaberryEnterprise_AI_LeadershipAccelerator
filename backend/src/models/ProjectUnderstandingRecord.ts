import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { UnderstandingItem } from '../services/delivery/projectUnderstanding';

/**
 * ProjectUnderstandingRecord — one conversation, understood.
 *
 * The persisted form of what `projectUnderstanding.ts` defines. The contract lives in the
 * service because it is pure and testable there; this is only its storage, and the two are
 * kept apart so the rules can be exercised without a database.
 *
 * `source_ref` is whatever identifies the conversation in its own system: a Synthflow
 * call_id for voice, a thread id for chat. Together with `source` it is UNIQUE, which is
 * what makes a re-delivered webhook a no-op instead of a second extraction.
 *
 * `rejected` holds what the contract refused, with the reason and the raw value. It is not
 * debris - it is the audit trail. On the first live call, two items per run were the model
 * quoting its own question back as if the customer had said it; those are refused now, and
 * this column is the only place that refusal is visible to a person.
 *
 * Columns must match backend/src/db/ensureProjectUnderstandingSchema.ts EXACTLY.
 */

export type UnderstandingRecordStatus = 'extracted' | 'failed';

export interface RejectedItemRecord {
  index: number;
  reason: string;
  raw: unknown;
}

export interface UnderstandingConfidence {
  total: number;
  facts: number;
  inferred: number;
  fact_ratio: number;
  dimensions_covered: number;
  dimensions_missing: string[];
}

class ProjectUnderstandingRecord extends Model {
  declare id: string;
  declare lead_id: number | null;
  declare source: string;
  declare source_ref: string;
  declare status: UnderstandingRecordStatus;
  declare title: string | null;
  declare proposed_surfaces: string[];
  declare items: UnderstandingItem[];
  declare rejected: RejectedItemRecord[];
  declare confidence: UnderstandingConfidence | null;
  declare error_class: string | null;
  declare error: string | null;
  declare cost_usd: number | null;
  declare runtime_ms: number | null;
  declare created_at: Date;
  declare updated_at: Date;
}

ProjectUnderstandingRecord.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    lead_id: { type: DataTypes.INTEGER, allowNull: true },
    source: { type: DataTypes.STRING(32), allowNull: false },
    source_ref: { type: DataTypes.STRING(128), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: true },
    proposed_surfaces: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    items: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    rejected: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    confidence: { type: DataTypes.JSONB, allowNull: true },
    error_class: { type: DataTypes.STRING(40), allowNull: true },
    error: { type: DataTypes.TEXT, allowNull: true },
    cost_usd: { type: DataTypes.DOUBLE, allowNull: true },
    runtime_ms: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    sequelize,
    modelName: 'ProjectUnderstandingRecord',
    tableName: 'project_understandings',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default ProjectUnderstandingRecord;
