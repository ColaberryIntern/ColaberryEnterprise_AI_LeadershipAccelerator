import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * StudentArchitectureSkill — the derived, per-(enrollment, skill) CAPE state:
 * placement, the 4 band scores, weighted proficiency, confidence, and next review
 * date (design doc §4, §6, §13). This is a CACHE, not a ledger — it is always
 * produced by `capeProficiencyService.recomputeStudentArchitectureSkill()` reading
 * 100% of that enrollment+skill's `student_skill_evidence` rows and writing this
 * row as a FULL REPLACE (every field rewritten together). No code path increments
 * a single field in place (no `UPDATE ... SET proficiency = proficiency + x`).
 *
 * `placement_score` (Phase 2, design doc §16) is derived from
 * `resume_skill_claims` + `diagnostic_attempts` via
 * `capePlacementService.computePlacementScore()` — 0 for a learner who has
 * never uploaded a resume (design doc §17 AC 1), and NEVER derived from
 * `student_skill_evidence` (§17 AC 2). `weights_version` records which
 * `architecture_skill_evidence_band_weights`
 * version produced `proficiency`, so a later weights change is auditable without
 * silently rewriting what an old computed number meant.
 */
export interface StudentArchitectureSkillAttributes {
  id?: string;
  enrollment_id: string;
  skill_id: string;
  placement_score: number;
  claim_score: number;
  knowledge_score: number;
  application_score: number;
  judgment_score: number;
  proficiency: number;
  confidence: number;
  evidence_count: number;
  last_evidence_at?: Date | null;
  next_review_at?: Date | null;
  weights_version?: number | null;
  computed_at?: Date;
}

class StudentArchitectureSkill extends Model<StudentArchitectureSkillAttributes>
  implements StudentArchitectureSkillAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare skill_id: string;
  declare placement_score: number;
  declare claim_score: number;
  declare knowledge_score: number;
  declare application_score: number;
  declare judgment_score: number;
  declare proficiency: number;
  declare confidence: number;
  declare evidence_count: number;
  declare last_evidence_at: Date | null;
  declare next_review_at: Date | null;
  declare weights_version: number | null;
  declare computed_at: Date;
}

StudentArchitectureSkill.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    skill_id: { type: DataTypes.STRING(40), allowNull: false },
    placement_score: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    claim_score: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    knowledge_score: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    application_score: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    judgment_score: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    proficiency: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    confidence: { type: DataTypes.DECIMAL(4, 3), allowNull: false, defaultValue: 0 },
    evidence_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    last_evidence_at: { type: DataTypes.DATE, allowNull: true },
    next_review_at: { type: DataTypes.DATE, allowNull: true },
    weights_version: { type: DataTypes.INTEGER, allowNull: true },
    computed_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'student_architecture_skill',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['enrollment_id', 'skill_id'] },
    ],
  }
);

export default StudentArchitectureSkill;
