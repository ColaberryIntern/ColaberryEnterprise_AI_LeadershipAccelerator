import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * One answer to one canonical question — and the place the contract's
 * "ask once" rule is actually enforced.
 *
 * KEYED ON (application_id, question_key), NOT on session. Both channels write
 * the SAME row for the same question, so "answered questions are not repeated
 * when switching channels" is a property of the storage rather than of the resume
 * logic remembering to check. The unique index
 * `uq_internship_response_per_question` is what makes it true under a retried
 * webhook and a form autosave arriving at once.
 *
 * `answered_via` records which channel got there first, satisfying "preserve
 * which channel collected each answer" without letting the second channel create
 * a duplicate. `question_set_version` is stamped per answer so a bank revision
 * never silently reinterprets an answer given against the old wording.
 *
 * There is no score column. The AI's reading of these answers lives on
 * InternshipDecision beside the human's decision, never here as though it were a
 * property of the applicant.
 */
export type ResponseState = 'not_asked' | 'answered' | 'skipped' | 'needs_followup' | 'confirmed';

class InternshipInterviewResponse extends Model {
  declare id: string;
  declare application_id: string;
  /** The session that captured it. Nullable so an answer outlives a deleted session. */
  declare session_id: string | null;
  declare question_key: string;
  declare question_set_version: number;
  declare answer_text: string | null;
  /** Booleans for yes/no, strings for choice. JSONB so the type is preserved. */
  declare answer_value: any;
  declare state: ResponseState;
  declare answered_via: 'form' | 'phone' | null;
  declare answered_at: Date | null;
  declare corrected_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

InternshipInterviewResponse.init(
  {
    id:                   { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    application_id:       { type: DataTypes.UUID, allowNull: false },
    session_id:           { type: DataTypes.UUID, allowNull: true },
    question_key:         { type: DataTypes.STRING(80), allowNull: false },
    question_set_version: { type: DataTypes.INTEGER, allowNull: false },
    answer_text:          { type: DataTypes.TEXT, allowNull: true },
    answer_value:         { type: DataTypes.JSONB, allowNull: true },
    state:                { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'answered' },
    answered_via:         { type: DataTypes.STRING(20), allowNull: true },
    answered_at:          { type: DataTypes.DATE, allowNull: true },
    corrected_at:         { type: DataTypes.DATE, allowNull: true },
    created_at:           { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at:           { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'internship_interview_responses',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default InternshipInterviewResponse;
