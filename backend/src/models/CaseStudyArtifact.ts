import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CaseStudyArtifact — a deliverable shown on a Case Study (diagram, document,
 * demo, repository file).
 *
 * NAME COLLISION, stated so nobody conflates the two: `runtime_portfolio_artifacts.kind`
 * already uses the literal string 'case_study' as its DEFAULT value, meaning "a
 * learner's case-study writeup". That is a different concept from a row in
 * `case_studies`. A PortfolioArtifact may become a row HERE (via the bare
 * `portfolio_artifact_id` UUID); it is never itself a CaseStudy.
 *
 * `status` defaults to 'candidate': linking an artifact never publishes it.
 */
export interface CaseStudyArtifactAttributes {
  id?: string;
  case_study_id: string;
  /** screenshot | architecture | photo | demo | deck | roadmap | report | evaluation | code | document | other */
  artifact_type?: string;
  title: string;
  description?: string | null;
  /** repo | portfolio_artifact | manual | generated */
  source_type?: string;
  source_ref?: string | null;
  source_commit_sha?: string | null;
  portfolio_artifact_id?: string | null;
  public_url?: string | null;
  preview_url?: string | null;
  /** public | request_only | private */
  visibility?: string;
  /** candidate | approved | rejected */
  status?: string;
  created_at?: Date;
  updated_at?: Date;
}

class CaseStudyArtifact
  extends Model<CaseStudyArtifactAttributes>
  implements CaseStudyArtifactAttributes
{
  declare id: string;
  declare case_study_id: string;
  declare artifact_type: string;
  declare title: string;
  declare description: string | null;
  declare source_type: string;
  declare source_ref: string | null;
  declare source_commit_sha: string | null;
  declare portfolio_artifact_id: string | null;
  declare public_url: string | null;
  declare preview_url: string | null;
  declare visibility: string;
  declare status: string;
  declare created_at: Date;
  declare updated_at: Date;
}

CaseStudyArtifact.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    case_study_id: { type: DataTypes.UUID, allowNull: false },
    artifact_type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'other' },
    title: { type: DataTypes.STRING(300), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    source_type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'manual' },
    source_ref: { type: DataTypes.STRING(512), allowNull: true },
    source_commit_sha: { type: DataTypes.STRING(64), allowNull: true },
    portfolio_artifact_id: { type: DataTypes.UUID, allowNull: true },
    public_url: { type: DataTypes.STRING(512), allowNull: true },
    preview_url: { type: DataTypes.STRING(512), allowNull: true },
    visibility: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'private' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'candidate' },
  },
  {
    sequelize,
    tableName: 'case_study_artifacts',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [{ fields: ['case_study_id', 'status'], name: 'idx_cs_artifacts_case_status' }],
  }
);

export default CaseStudyArtifact;
