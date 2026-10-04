import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Coaching, peer notes and official grading — kept apart.
 *
 * AI coaching, a peer's note and an instructor's score are three different things
 * with three different authorities. Merging them is how a practice suggestion ends up
 * looking like a grade, so `evaluator_role` keeps them distinct and `visibility`
 * defaults to 'private': a rehearsal score belongs to the student until they say
 * otherwise.
 *
 * `modality_analyzed` records what was ACTUALLY available — transcript, audio, video,
 * slides. A reviewer that saw only a transcript must not make claims about delivery,
 * confidence or body language, and storing the modality is what lets the UI say "not
 * assessable" honestly instead of rendering an unknown as a zero.
 *
 * `rubric_version` is part of the unique key: re-running the AI reviewer against the
 * same rubric updates its row, while bumping the rubric is a genuinely new
 * assessment and gets its own.
 */
export type PresentationEvaluatorRole = 'ai_coach' | 'peer' | 'instructor' | 'self';
export type PresentationFeedbackVisibility = 'private' | 'cohort' | 'staff';
export type PresentationReviewState = 'draft' | 'shared' | 'final';

export interface PresentationFeedbackAttributes {
  id?: string;
  attempt_id: string;
  evaluator_role: PresentationEvaluatorRole;
  evaluator_id?: string | null;
  rubric_version?: string;
  modality_analyzed?: string[];
  score_json?: Record<string, unknown> | null;
  findings_json?: unknown[];
  improvements_json?: unknown[];
  visibility?: PresentationFeedbackVisibility;
  model_provenance?: Record<string, unknown> | null;
  review_state?: PresentationReviewState;
  created_at?: Date;
  updated_at?: Date;
}

class PresentationFeedback
  extends Model<PresentationFeedbackAttributes>
  implements PresentationFeedbackAttributes {
  declare id: string;
  declare attempt_id: string;
  declare evaluator_role: PresentationEvaluatorRole;
  declare evaluator_id: string | null;
  declare rubric_version: string;
  declare modality_analyzed: string[];
  declare score_json: Record<string, unknown> | null;
  declare findings_json: unknown[];
  declare improvements_json: unknown[];
  declare visibility: PresentationFeedbackVisibility;
  declare model_provenance: Record<string, unknown> | null;
  declare review_state: PresentationReviewState;
  declare created_at: Date;
  declare updated_at: Date;
}

PresentationFeedback.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    attempt_id: { type: DataTypes.UUID, allowNull: false },
    evaluator_role: { type: DataTypes.STRING(30), allowNull: false },
    evaluator_id: { type: DataTypes.STRING(160), allowNull: true },
    rubric_version: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'v1' },
    modality_analyzed: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    // Nullable: an assessment with no assessable dimension stores no score rather
    // than a misleading zero.
    score_json: { type: DataTypes.JSONB, allowNull: true },
    findings_json: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    improvements_json: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    visibility: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'private' },
    model_provenance: { type: DataTypes.JSONB, allowNull: true },
    review_state: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'draft' },
  },
  {
    sequelize,
    tableName: 'presentation_feedback',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['attempt_id', 'evaluator_role', 'rubric_version'],
        name: 'presentation_feedback_unique_verdict',
      },
      { fields: ['attempt_id'], name: 'presentation_feedback_attempt' },
    ],
  },
);

export default PresentationFeedback;
