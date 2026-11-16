/**
 * ServiceGapAnalysis - one AI Service Gap Detector assessment of one case study against one catalog state.
 *
 * Advisory: a row RECOMMENDS (link / expand / growth / propose / insufficient). It never changes a service or a link.
 * Unique on (tenant, case study, both fingerprints, prompt version), which makes analysis idempotent. The review
 * columns record the human's call on the recommendation (accepted / dismissed), with who and when.
 * Schema: db/ensureServiceGapSchema.ts.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type ServiceGapAnalysisStatus = 'ok' | 'insufficient' | 'failed';
export type ServiceGapReviewState = 'open' | 'accepted' | 'dismissed';

export interface ServiceGapAnalysisAttributes {
  id: string;
  tenant_id: string;
  case_study_id: string;
  case_study_fingerprint: string;
  catalog_fingerprint: string;
  prompt_version: string;
  model_version: string;
  status: ServiceGapAnalysisStatus;
  decision: string | null;
  result: unknown | null;
  error_class: string | null;
  error_message: string | null;
  analyzed_by: string | null;
  analyzed_at: Date;
  review_state: ServiceGapReviewState;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
}

export class ServiceGapAnalysis extends Model<ServiceGapAnalysisAttributes> {
  declare id: string;
  declare tenant_id: string;
  declare case_study_id: string;
  declare case_study_fingerprint: string;
  declare catalog_fingerprint: string;
  declare prompt_version: string;
  declare model_version: string;
  declare status: ServiceGapAnalysisStatus;
  declare decision: string | null;
  declare result: unknown | null;
  declare error_class: string | null;
  declare error_message: string | null;
  declare analyzed_by: string | null;
  declare analyzed_at: Date;
  declare review_state: ServiceGapReviewState;
  declare review_note: string | null;
  declare reviewed_by: string | null;
  declare reviewed_at: Date | null;
  declare created_at: Date;
}

ServiceGapAnalysis.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    case_study_id: { type: DataTypes.UUID, allowNull: false },
    case_study_fingerprint: { type: DataTypes.STRING(64), allowNull: false },
    catalog_fingerprint: { type: DataTypes.STRING(64), allowNull: false },
    prompt_version: { type: DataTypes.TEXT, allowNull: false },
    model_version: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.TEXT, allowNull: false },
    decision: { type: DataTypes.TEXT, allowNull: true },
    result: { type: DataTypes.JSONB, allowNull: true },
    error_class: { type: DataTypes.TEXT, allowNull: true },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    analyzed_by: { type: DataTypes.TEXT, allowNull: true },
    analyzed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    review_state: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'open' },
    review_note: { type: DataTypes.TEXT, allowNull: true },
    reviewed_by: { type: DataTypes.TEXT, allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: 'ServiceGapAnalysis', tableName: 'service_gap_analyses', timestamps: false },
);

export default ServiceGapAnalysis;
