import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface RubricQuestion {
  id: string;
  text: string;
  expected_topics: string[];
  max_points: number;
}

class InterviewRubric extends Model {
  declare id: string;
  declare week_number: number;
  declare questions: RubricQuestion[];
  declare created_at: Date;
  declare updated_at: Date;
}

InterviewRubric.init(
  {
    id:          { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    week_number: { type: DataTypes.INTEGER, allowNull: false },
    questions:   { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    created_at:  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at:  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'interview_rubrics',
    timestamps: false,
    indexes: [{ unique: true, fields: ['week_number'], name: 'uq_interview_rubric_week' }],
  }
);

export default InterviewRubric;
