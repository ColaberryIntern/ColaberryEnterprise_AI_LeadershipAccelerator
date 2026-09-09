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
  /** business_outcome | delivery | performance | scale | quality | adoption | technical */
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
  /*
   * SHAPED METRICS. All nullable, all written only by a collector or the shape
   * migration, and nothing reads them until one has. A row written before these
   * columns existed keeps loading, gating and rendering exactly as it did.
   *
   * count | ratio | share | span | series. Deliberately a plain string rather
   * than an enum column: the guard in `caseStudyGuards.ts` rejects a payload
   * that disagrees with its shape, and a database constraint would turn a bad
   * write into a 500 instead of a reported sync issue.
   */
  shape?: string | null;
  payload?: Record<string, any> | null;
  /** Written by a human, never by a collector. All three answers or none. */
  plain?: Record<string, any> | null;
  collector_key?: string | null;
  collected_sha?: string | null;
  /** The one collection field that ever reaches a reader. */
  reproduce_command?: string | null;
  /** sha256 of the payload. Same sha with a different hash is drift. */
  output_hash?: string | null;
  collected_at?: Date | null;
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
  declare shape: string | null;
  declare payload: Record<string, any> | null;
  declare plain: Record<string, any> | null;
  declare collector_key: string | null;
  declare collected_sha: string | null;
  declare reproduce_command: string | null;
  declare output_hash: string | null;
  declare collected_at: Date | null;
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
    shape: { type: DataTypes.STRING(20), allowNull: true },
    payload: { type: DataTypes.JSONB, allowNull: true },
    plain: { type: DataTypes.JSONB, allowNull: true },
    collector_key: { type: DataTypes.STRING(60), allowNull: true },
    collected_sha: { type: DataTypes.STRING(64), allowNull: true },
    reproduce_command: { type: DataTypes.TEXT, allowNull: true },
    output_hash: { type: DataTypes.STRING(64), allowNull: true },
    collected_at: { type: DataTypes.DATE, allowNull: true },
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
