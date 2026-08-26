import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CaseStudyAiDraft — one AI proposal for one dotted snapshot path.
 *
 * THE ROW IS THE QUARANTINE. A generated value is written here and stays here.
 * It reaches `case_study_snapshots.content` only when a human promotes it, and
 * promotion goes through the existing `applyHumanOverride`, so the value lands
 * in content carrying tier `human_override` and the name of the HUMAN.
 *
 * `status` defaults to `'proposed'` — the closed state — for the same reason
 * `case_study_metrics.publishable` defaults false: an asset that has not been
 * decided about must not be one that is already counted.
 *
 * `decided_by` is nullable and has NO default. That is deliberate: NULL is what
 * makes "nobody has looked at this" distinguishable from "somebody accepted
 * it", and a default of `''` would have collapsed both into one value.
 */
export interface CaseStudyAiDraftAttributes {
  id?: string;
  case_study_id: string;
  draft_path: string;
  draft_value: string;
  /** proposed | promoted | rejected */
  status?: string;
  /** Model identifier, or `deterministic` for the rule-based generator. */
  generated_by: string;
  rationale: string;
  decided_by?: string | null;
  decided_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class CaseStudyAiDraft
  extends Model<CaseStudyAiDraftAttributes>
  implements CaseStudyAiDraftAttributes
{
  declare id: string;
  declare case_study_id: string;
  declare draft_path: string;
  declare draft_value: string;
  declare status: string;
  declare generated_by: string;
  declare rationale: string;
  declare decided_by: string | null;
  declare decided_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CaseStudyAiDraft.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    case_study_id: { type: DataTypes.UUID, allowNull: false },
    draft_path: { type: DataTypes.STRING(255), allowNull: false },
    draft_value: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'proposed' },
    generated_by: { type: DataTypes.STRING(255), allowNull: false },
    rationale: { type: DataTypes.TEXT, allowNull: false },
    decided_by: { type: DataTypes.STRING(255), allowNull: true },
    decided_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'case_study_ai_drafts',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [{ fields: ['case_study_id', 'status'], name: 'cs_ai_drafts_by_case_study' }],
  }
);

export default CaseStudyAiDraft;
