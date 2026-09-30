import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * ResumeSkillClaim — versioned, provisional, resume/LinkedIn-derived skill
 * claims (design doc §5, §13). One row per (enrollment_id, resume_version,
 * skill_id). "Current" claims for a learner are the rows whose
 * `resume_version` equals that learner's `onboarding_profiles.resume_version`
 * — there is no separate `is_current` flag (see ensureCapePlacementSchema.ts
 * for why). Insert-only: this model has no update/delete code path anywhere
 * in this repo (see capeResumeClaimService.ts, which exposes only
 * `persistResumeSkillClaims`, an insert-only `findOrCreate` per skill).
 *
 * These rows NEVER feed `student_skill_evidence` or
 * `student_architecture_skill`'s claim/knowledge/application/judgment bands —
 * they feed ONLY `capePlacementService.computePlacementScore()`, which writes
 * `student_architecture_skill.placement_score` (design doc §4 "one learner
 * profile, two scores"; §17 AC 2).
 *
 * idempotency_key format (design doc §13): resume:<resume_version>:<skill_id>
 */
export type EvidenceKind =
  | 'keyword_list'
  | 'job_bullet'
  | 'built_owned'
  | 'measurable_outcome'
  | 'production'
  | 'led_architecture_decisions';

export interface ResumeSkillClaimAttributes {
  id?: string;
  enrollment_id: string;
  resume_version: number;
  skill_id: string;
  subskills?: string[];
  evidence_text?: string | null;
  evidence_kind: EvidenceKind;
  recency_years?: number | null;
  ownership?: string | null;
  scope?: string | null;
  confidence: number;
  credit_weight: number;
  source_count?: number;
  extractor_version?: string | null;
  idempotency_key: string;
  created_at?: Date;
}

class ResumeSkillClaim extends Model<ResumeSkillClaimAttributes>
  implements ResumeSkillClaimAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare resume_version: number;
  declare skill_id: string;
  declare subskills: string[];
  declare evidence_text: string | null;
  declare evidence_kind: EvidenceKind;
  declare recency_years: number | null;
  declare ownership: string | null;
  declare scope: string | null;
  declare confidence: number;
  declare credit_weight: number;
  declare source_count: number;
  declare extractor_version: string | null;
  declare idempotency_key: string;
  declare created_at: Date;
}

ResumeSkillClaim.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    resume_version: { type: DataTypes.INTEGER, allowNull: false },
    skill_id: { type: DataTypes.STRING(40), allowNull: false },
    subskills: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    evidence_text: { type: DataTypes.TEXT, allowNull: true },
    evidence_kind: { type: DataTypes.STRING(30), allowNull: false },
    recency_years: { type: DataTypes.DECIMAL(4, 1), allowNull: true },
    ownership: { type: DataTypes.STRING(20), allowNull: true },
    scope: { type: DataTypes.STRING(20), allowNull: true },
    confidence: { type: DataTypes.DECIMAL(4, 3), allowNull: false, defaultValue: 0 },
    credit_weight: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    source_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    extractor_version: { type: DataTypes.STRING(60), allowNull: true },
    idempotency_key: { type: DataTypes.STRING(300), allowNull: false, unique: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'resume_skill_claims',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['idempotency_key'] },
      { fields: ['enrollment_id', 'skill_id'] },
      { fields: ['enrollment_id', 'resume_version'] },
    ],
  }
);

export default ResumeSkillClaim;
