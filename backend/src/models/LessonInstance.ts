import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface LessonInstanceAttributes {
  id?: string;
  lesson_id: string;
  enrollment_id: string;
  status: 'locked' | 'available' | 'in_progress' | 'completed';
  generated_content_json?: any;
  structured_responses_json?: any;
  reflection_responses_json?: any;
  quiz_score?: number;
  quiz_responses_json?: any;
  attempts: number;
  started_at?: Date;
  completed_at?: Date;
  created_at?: Date;
}

class LessonInstance extends Model<LessonInstanceAttributes> implements LessonInstanceAttributes {
  declare id: string;
  declare lesson_id: string;
  declare enrollment_id: string;
  declare status: 'locked' | 'available' | 'in_progress' | 'completed';
  declare generated_content_json: any;
  declare structured_responses_json: any;
  declare reflection_responses_json: any;
  declare quiz_score: number;
  declare quiz_responses_json: any;
  declare attempts: number;
  declare started_at: Date;
  declare completed_at: Date;
  declare created_at: Date;
}

LessonInstance.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    lesson_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'curriculum_lessons', key: 'id' },
    },
    enrollment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'enrollments', key: 'id' },
    },
    status: {
      type: DataTypes.ENUM('locked', 'available', 'in_progress', 'completed'),
      allowNull: false,
      defaultValue: 'locked',
    },
    generated_content_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    structured_responses_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    reflection_responses_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    quiz_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    quiz_responses_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'lesson_instances',
    timestamps: false,
  }
);

export default LessonInstance;
