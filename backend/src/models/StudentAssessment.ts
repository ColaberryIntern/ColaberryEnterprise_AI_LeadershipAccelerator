import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type StudentAssessmentStatus = 'on_track' | 'watch' | 'at_risk' | 'critical' | 'unknown';
export type StudentAssessmentConfidenceBand = 'high' | 'moderate' | 'low' | 'insufficient_evidence';
export type StudentAssessmentRootCause =
  | 'technical_blocker'
  | 'conceptual_misunderstanding'
  | 'environment_setup_problem'
  | 'time_management_problem'
  | 'motivation_confidence_decline'
  | 'missing_prerequisite'
  | 'instructor_dependency'
  | 'project_scope_problem'
  | 'certification_readiness_gap'
  | 'data_quality_uncertainty'
  | 'unknown_conversation_required';

/**
 * StudentAssessment — Reese Agentic AI Employee mission, Checkpoint D
 * (Capability 4: evidence-grounded assessment engine). Confirmed absent
 * anywhere in this codebase at discovery (the only prior art,
 * studentSuccessAgent.ts, is dead code checking a non-existent Enrollment
 * column and confirmed unusable — see assessStudentHealth.ts's own header).
 *
 * ONE IMMUTABLE ROW PER ASSESSMENT RUN — unlike MetricReliabilityRecord's
 * mutate-in-place convention, an assessment is a point-in-time judgment
 * (it carries its own rules_version/model and a specific evidence snapshot);
 * overwriting it would destroy the assessment history the mission's own
 * Checkpoint D scope explicitly asks for. Never updated after insert.
 *
 * Evidence provenance (supporting/contradicting/excluded) is stored as JSONB
 * arrays built deterministically from getStudentSuccessSnapshot()'s own
 * SnapshotField envelopes, not authored by the LLM — the LLM selects which
 * already-real evidence categories support its conclusion; it never invents
 * evidence text. See assessStudentHealth.ts for the full assembly.
 */
export interface StudentAssessmentAttributes {
  id?: string;
  enrollment_id: string;
  status: StudentAssessmentStatus;
  confidence_score: number;
  confidence_band: StudentAssessmentConfidenceBand;
  primary_root_cause: StudentAssessmentRootCause | null;
  secondary_root_cause: StudentAssessmentRootCause | null;
  supporting_evidence: unknown[];
  contradicting_evidence: unknown[];
  excluded_evidence: unknown[];
  positive_momentum_signals: string[];
  unanswered_questions: string[];
  recommended_intervention: string | null;
  requires_human_review: boolean;
  reassessment_date: Date | null;
  rules_version: string;
  model: string | null;
  llm_cost_usd: number | null;
}

class StudentAssessment extends Model<StudentAssessmentAttributes> implements StudentAssessmentAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare status: StudentAssessmentStatus;
  declare confidence_score: number;
  declare confidence_band: StudentAssessmentConfidenceBand;
  declare primary_root_cause: StudentAssessmentRootCause | null;
  declare secondary_root_cause: StudentAssessmentRootCause | null;
  declare supporting_evidence: unknown[];
  declare contradicting_evidence: unknown[];
  declare excluded_evidence: unknown[];
  declare positive_momentum_signals: string[];
  declare unanswered_questions: string[];
  declare recommended_intervention: string | null;
  declare requires_human_review: boolean;
  declare reassessment_date: Date | null;
  declare rules_version: string;
  declare model: string | null;
  declare llm_cost_usd: number | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

StudentAssessment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'unknown' },
    confidence_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    confidence_band: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'insufficient_evidence' },
    primary_root_cause: { type: DataTypes.STRING(50), allowNull: true },
    secondary_root_cause: { type: DataTypes.STRING(50), allowNull: true },
    supporting_evidence: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    contradicting_evidence: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    excluded_evidence: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    positive_momentum_signals: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    unanswered_questions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    recommended_intervention: { type: DataTypes.TEXT, allowNull: true },
    requires_human_review: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    reassessment_date: { type: DataTypes.DATE, allowNull: true },
    rules_version: { type: DataTypes.STRING(20), allowNull: false },
    model: { type: DataTypes.STRING(100), allowNull: true },
    llm_cost_usd: { type: DataTypes.DECIMAL(10, 6), allowNull: true },
  },
  {
    sequelize,
    tableName: 'student_assessments',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['enrollment_id', 'created_at'], name: 'idx_student_assessment_enrollment' },
    ],
  }
);

export default StudentAssessment;
