/** AssessmentAttempt — one student's attempt at a Knowledge Check (quiz) or an
 *  Evaluation card. Captures the score, per-question responses, and per-competency
 *  breakdown so we can (a) reveal the correct answers, (b) gate the Evaluation at
 *  75%, and (c) correlate BEGINNING knowledge (a section's quiz) with CURRENT
 *  knowledge (its evaluation) to measure growth.
 *
 *  `program_id` + `week` are denormalized so a section's quiz and evaluation pair
 *  up for pre/post analysis without a join. Quizzes keep a single latest attempt
 *  per (enrollment, card); Evaluations append (retry history / attempts-to-pass).
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type AssessmentKind = 'quiz' | 'evaluation';

/** One answered question in an attempt — the full item-level record. */
export interface AssessmentResponseItem {
  question: string;
  competency: string | null;      // domain_id this question tests (for pre/post per-competency growth)
  options: string[];
  selected_index: number | null;  // what the student picked (null = skipped)
  correct_index: number;
  is_correct: boolean;
  explanation: string | null;     // shown after answering (quiz) / after submit (eval)
  time_ms: number | null;         // time spent on this question
}

/** Per-competency roll-up within a single attempt. */
export interface CompetencyScore {
  correct: number;
  total: number;
  pct: number;                    // 0..1
}

class AssessmentAttempt extends Model {
  declare id: string;
  declare enrollment_id: string;
  declare card_id: string;
  declare program_id: string | null;
  declare week: number | null;
  declare kind: AssessmentKind;
  declare score: number;                 // 0..1 overall
  declare correct_count: number;
  declare total_count: number;
  declare passed: boolean | null;        // eval: score >= threshold; quiz: null (no gate)
  declare pass_threshold: number | null; // 0.75 for eval, null for quiz
  declare attempt_number: number;
  declare duration_ms: number | null;
  declare responses: AssessmentResponseItem[];
  declare competency_scores: Record<string, CompetencyScore>;
  declare started_at: Date | null;
  declare submitted_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

AssessmentAttempt.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  enrollment_id: { type: DataTypes.UUID, allowNull: false },
  card_id: { type: DataTypes.UUID, allowNull: false },
  program_id: { type: DataTypes.UUID, allowNull: true },
  week: { type: DataTypes.INTEGER, allowNull: true },
  kind: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'quiz' },
  score: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  correct_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  total_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  passed: { type: DataTypes.BOOLEAN, allowNull: true },
  pass_threshold: { type: DataTypes.DOUBLE, allowNull: true },
  attempt_number: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  duration_ms: { type: DataTypes.INTEGER, allowNull: true },
  responses: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  competency_scores: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  started_at: { type: DataTypes.DATE, allowNull: true },
  submitted_at: { type: DataTypes.DATE, allowNull: true },
}, {
  sequelize, modelName: 'AssessmentAttempt', tableName: 'runtime_assessment_attempts',
  underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at',
});

export default AssessmentAttempt;
