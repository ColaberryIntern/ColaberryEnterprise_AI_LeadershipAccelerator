import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CaseStudySnapshot — immutable versioned content for one Case Study.
 *
 * A regeneration is a NEW VERSION, never an overwrite (the build_plans
 * precedent). `content_hash` is what makes a repeat sync a no-op: identical
 * normalised content produces an identical hash and therefore no new row, which
 * is the headline idempotency requirement of the whole system.
 *
 * TIMESTAMPS: the DDL gives this table `created_at` but deliberately NO
 * `updated_at` — a snapshot is immutable. `updatedAt: false` is therefore load
 * bearing: with Sequelize's default `timestamps: true` every write would try to
 * set a column that does not exist and fail at runtime.
 */
export interface CaseStudySnapshotAttributes {
  id?: string;
  case_study_id: string;
  version: number;
  /** draft | approved | superseded */
  status?: string;
  source_commit_map?: Record<string, any>;
  content?: Record<string, any>;
  provenance?: Record<string, any>;
  generated_at?: Date;
  /** repo_sync | manual | ai_draft */
  generated_by?: string;
  approved_by?: string | null;
  approved_at?: Date | null;
  content_hash: string;
  created_at?: Date;
}

class CaseStudySnapshot
  extends Model<CaseStudySnapshotAttributes>
  implements CaseStudySnapshotAttributes
{
  declare id: string;
  declare case_study_id: string;
  declare version: number;
  declare status: string;
  declare source_commit_map: Record<string, any>;
  declare content: Record<string, any>;
  declare provenance: Record<string, any>;
  declare generated_at: Date;
  declare generated_by: string;
  declare approved_by: string | null;
  declare approved_at: Date | null;
  declare content_hash: string;
  declare created_at: Date;
}

CaseStudySnapshot.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    case_study_id: { type: DataTypes.UUID, allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
    source_commit_map: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    content: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    provenance: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    generated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    generated_by: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'repo_sync' },
    approved_by: { type: DataTypes.STRING(255), allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: true },
    content_hash: { type: DataTypes.STRING(64), allowNull: false },
  },
  {
    sequelize,
    tableName: 'case_study_snapshots',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['case_study_id', 'version'], name: 'cs_snapshots_unique_case_version' },
      { fields: ['case_study_id', 'content_hash'], name: 'idx_cs_snapshots_case_hash' },
      { fields: ['status'], name: 'idx_cs_snapshots_status' },
    ],
  }
);

export default CaseStudySnapshot;
