import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface CurriculumLessonAttributes {
  id?: string;
  module_id: string;
  lesson_number: number;
  title: string;
  description?: string;
  lesson_type: 'concept' | 'lab' | 'assessment' | 'reflection' | 'section';
  estimated_minutes: number;
  requires_structured_input: boolean;
  structured_fields_schema?: any;
  content_template_json?: any;
  completion_requirements?: any;
  learning_goal?: string;
  mandatory?: boolean;
  build_phase_flag?: boolean;
  presentation_phase_flag?: boolean;
  associated_session_id?: string;
  required_min_completion_before_session?: number;
  sort_order?: number;
  created_at?: Date;
}

class CurriculumLesson extends Model<CurriculumLessonAttributes> implements CurriculumLessonAttributes {
  declare id: string;
  declare module_id: string;
  declare lesson_number: number;
  declare title: string;
  declare description: string;
  declare lesson_type: 'concept' | 'lab' | 'assessment' | 'reflection' | 'section';
  declare estimated_minutes: number;
  declare requires_structured_input: boolean;
  declare structured_fields_schema: any;
  declare content_template_json: any;
  declare completion_requirements: any;
  declare learning_goal: string;
  declare mandatory: boolean;
  declare build_phase_flag: boolean;
  declare presentation_phase_flag: boolean;
  declare associated_session_id: string;
  declare required_min_completion_before_session: number;
  declare sort_order: number;
  declare created_at: Date;
}

CurriculumLesson.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    module_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'curriculum_modules', key: 'id' },
    },
    lesson_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    lesson_type: {
      type: DataTypes.ENUM('concept', 'lab', 'assessment', 'reflection', 'section'),
      allowNull: false,
      defaultValue: 'section',
    },
    estimated_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 25,
    },
    requires_structured_input: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    structured_fields_schema: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    content_template_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    completion_requirements: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    learning_goal: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    mandatory: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    build_phase_flag: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    presentation_phase_flag: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    associated_session_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'live_sessions', key: 'id' },
    },
    required_min_completion_before_session: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'curriculum_lessons',
    timestamps: false,
  }
);

export default CurriculumLesson;
