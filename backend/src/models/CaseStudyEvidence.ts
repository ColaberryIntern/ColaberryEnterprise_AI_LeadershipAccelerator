import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CaseStudyEvidence — the artefact that backs a claim on a Case Study.
 *
 * `evidence_record_id` links the existing `evidence_records` table without owning
 * or mutating it (bare UUID, no FK — see the ensureCaseStudySchema.ts header).
 * `is_publicly_openable` defaults false for the same reason repo links do: public
 * exposure is opt-in, never inherited.
 *
 * TIMESTAMPS: the DDL gives this table `created_at` and deliberately NO
 * `updated_at`. `updatedAt: false` is load bearing — under Sequelize's default
 * every write would try to set a column that does not exist.
 */
export interface CaseStudyEvidenceAttributes {
  id?: string;
  case_study_id: string;
  evidence_record_id?: string | null;
  metric_id?: string | null;
  /** evidence_record | github_commit | github_pr | repo_file | artifact | client_confirmation | internal_measurement | manual */
  source_type?: string;
  source_ref?: string | null;
  source_commit_sha?: string | null;
  title: string;
  description?: string | null;
  /** verified | anonymized | illustrative | pending */
  verification_class?: string;
  is_publicly_openable?: boolean;
  public_url?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: Date | null;
  metadata?: Record<string, any>;
  created_at?: Date;
}

class CaseStudyEvidence
  extends Model<CaseStudyEvidenceAttributes>
  implements CaseStudyEvidenceAttributes
{
  declare id: string;
  declare case_study_id: string;
  declare evidence_record_id: string | null;
  declare metric_id: string | null;
  declare source_type: string;
  declare source_ref: string | null;
  declare source_commit_sha: string | null;
  declare title: string;
  declare description: string | null;
  declare verification_class: string;
  declare is_publicly_openable: boolean;
  declare public_url: string | null;
  declare reviewed_by: string | null;
  declare reviewed_at: Date | null;
  declare metadata: Record<string, any>;
  declare created_at: Date;
}

CaseStudyEvidence.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    case_study_id: { type: DataTypes.UUID, allowNull: false },
    evidence_record_id: { type: DataTypes.UUID, allowNull: true },
    metric_id: { type: DataTypes.UUID, allowNull: true },
    source_type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'manual' },
    source_ref: { type: DataTypes.STRING(512), allowNull: true },
    source_commit_sha: { type: DataTypes.STRING(64), allowNull: true },
    title: { type: DataTypes.STRING(300), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    verification_class: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    is_publicly_openable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    public_url: { type: DataTypes.STRING(512), allowNull: true },
    reviewed_by: { type: DataTypes.STRING(255), allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  {
    sequelize,
    tableName: 'case_study_evidence',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      { fields: ['case_study_id'], name: 'idx_cs_evidence_case_study' },
      { fields: ['metric_id'], name: 'idx_cs_evidence_metric' },
    ],
  }
);

export default CaseStudyEvidence;
