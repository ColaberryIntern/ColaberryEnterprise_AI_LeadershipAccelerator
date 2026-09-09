import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * One attempt at the interview through one channel.
 *
 * A single application can have SEVERAL sessions — that is the point. Starting
 * online and finishing by phone is two sessions over one shared set of answers,
 * because the answers live in `internship_interview_responses` keyed by
 * (application_id, question_key) rather than on the session. A failed call
 * followed by an online continuation is likewise two sessions and zero repeated
 * questions.
 *
 * `provider_call_id` is UNIQUE where present, so a replayed Synthflow completion
 * webhook resolves to the session it already wrote instead of opening a second.
 */
export type InterviewChannel = 'form' | 'phone';
export type InterviewSessionStatus =
  | 'scheduled' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

class InternshipInterviewSession extends Model {
  declare id: string;
  declare application_id: string;
  declare channel: InterviewChannel;
  declare status: InterviewSessionStatus;
  declare question_set_id: string;
  declare scheduled_for: Date | null;
  declare started_at: Date | null;
  declare completed_at: Date | null;
  /** Synthflow's call id. Null for form sessions and until a call is placed. */
  declare provider_call_id: string | null;
  declare provider_payload: Record<string, any> | null;
  /** Only ever populated when the applicant consented to recording. */
  declare transcript: string | null;
  declare summary: string | null;
  declare failure_reason: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

InternshipInterviewSession.init(
  {
    id:               { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    application_id:   { type: DataTypes.UUID, allowNull: false },
    channel:          { type: DataTypes.STRING(20), allowNull: false },
    status:           { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'in_progress' },
    question_set_id:  { type: DataTypes.UUID, allowNull: true },
    scheduled_for:    { type: DataTypes.DATE, allowNull: true },
    started_at:       { type: DataTypes.DATE, allowNull: true },
    completed_at:     { type: DataTypes.DATE, allowNull: true },
    provider_call_id: { type: DataTypes.STRING(120), allowNull: true },
    provider_payload: { type: DataTypes.JSONB, allowNull: true },
    transcript:       { type: DataTypes.TEXT, allowNull: true },
    summary:          { type: DataTypes.TEXT, allowNull: true },
    failure_reason:   { type: DataTypes.STRING(120), allowNull: true },
    created_at:       { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at:       { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'internship_interview_sessions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default InternshipInterviewSession;
