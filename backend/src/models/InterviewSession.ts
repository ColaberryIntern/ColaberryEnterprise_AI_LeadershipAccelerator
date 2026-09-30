import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type InterviewStatus = 'pending' | 'in_progress' | 'completed';

export interface InterviewAnswer {
  question_id: string;
  question_text: string;
  answer: string;
  points_earned: number;
}

class InterviewSession extends Model {
  declare id: string;
  declare enrollment_id: string;
  declare week_number: number;
  declare rubric_id: string;
  declare status: InterviewStatus;
  declare answers: InterviewAnswer[];
  declare total_score: number | null;
  declare feedback: string | null;
  declare emailed_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

InterviewSession.init(
  {
    id:            { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    week_number:   { type: DataTypes.INTEGER, allowNull: false },
    rubric_id:     { type: DataTypes.UUID, allowNull: false },
    status:        { type: DataTypes.TEXT, allowNull: false, defaultValue: 'pending' },
    answers:       { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    total_score:   { type: DataTypes.FLOAT, allowNull: true },
    feedback:      { type: DataTypes.TEXT, allowNull: true },
    emailed_at:    { type: DataTypes.DATE, allowNull: true },
    created_at:    { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at:    { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'interview_sessions',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['enrollment_id', 'week_number'],
        name: 'uq_interview_session_enrollment_week',
      },
      { fields: ['enrollment_id'], name: 'idx_interview_sessions_enrollment_id' },
    ],
  }
);

export default InterviewSession;
