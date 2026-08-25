import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CaseStudyMetric — one proof point on a Case Study.
 *
 * `publishable` defaults FALSE and `verification_class` defaults 'pending': a
 * metric is invisible to any public surface until a human moves both. AI writes
 * rows here only as 'pending' and may never set 'verified'.
 *
 * `evidence_id` is a bare UUID pointing at the supporting case_study_evidence
 * row, not a FK — the two tables are written in either order during a sync.
 *
 * The canonical `verification_class` / `verification_method` unions are owned by
 * `types/caseStudy.ts`; these columns stay `string` here so there is one source
 * of truth rather than two that can drift.
 */
export interface CaseStudyMetricAttributes {
  id?: string;
  case_study_id: string;
  metric_key: string;
  label: string;
  value_display?: string | null;
  numeric_value?: number | null;
  unit?: string | null;
  /** technical | business | delivery | quality */
  metric_type?: string;
  /** verified | anonymized | illustrative | pending */
  verification_class?: string;
  /** client | repo | platform | internal | self | manual */
  verification_method?: string;
  evidence_id?: string | null;
  evidence_description?: string | null;
  baseline?: string | null;
  sample?: string | null;
  methodology?: string | null;
  limitations?: any[];
  verified_by?: string | null;
  verified_at?: Date | null;
  is_headline?: boolean;
  publishable?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

class CaseStudyMetric extends Model<CaseStudyMetricAttributes> implements CaseStudyMetricAttributes {
  declare id: string;
  declare case_study_id: string;
  declare metric_key: string;
  declare label: string;
  declare value_display: string | null;
  declare numeric_value: number | null;
  declare unit: string | null;
  declare metric_type: string;
  declare verification_class: string;
  declare verification_method: string;
  declare evidence_id: string | null;
  declare evidence_description: string | null;
  declare baseline: string | null;
  declare sample: string | null;
  declare methodology: string | null;
  declare limitations: any[];
  declare verified_by: string | null;
  declare verified_at: Date | null;
  declare is_headline: boolean;
  declare publishable: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

CaseStudyMetric.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    case_study_id: { type: DataTypes.UUID, allowNull: false },
    metric_key: { type: DataTypes.STRING(120), allowNull: false },
    label: { type: DataTypes.STRING(300), allowNull: false },
    value_display: { type: DataTypes.STRING(300), allowNull: true },
    numeric_value: { type: DataTypes.DOUBLE, allowNull: true },
    unit: { type: DataTypes.STRING(40), allowNull: true },
    metric_type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'technical' },
    verification_class: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    verification_method: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'manual' },
    evidence_id: { type: DataTypes.UUID, allowNull: true },
    evidence_description: { type: DataTypes.TEXT, allowNull: true },
    baseline: { type: DataTypes.STRING(300), allowNull: true },
    sample: { type: DataTypes.STRING(300), allowNull: true },
    methodology: { type: DataTypes.TEXT, allowNull: true },
    limitations: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    verified_by: { type: DataTypes.STRING(255), allowNull: true },
    verified_at: { type: DataTypes.DATE, allowNull: true },
    is_headline: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    publishable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    tableName: 'case_study_metrics',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['case_study_id', 'publishable'], name: 'idx_cs_metrics_case_publishable' },
      { fields: ['verification_class'], name: 'idx_cs_metrics_verification_class' },
    ],
  }
);

export default CaseStudyMetric;
