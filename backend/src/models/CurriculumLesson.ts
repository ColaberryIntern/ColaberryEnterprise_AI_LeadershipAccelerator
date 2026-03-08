import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface CurriculumLessonAttributes {
  id?: string;
  module_id: string;
  lesson_number: number;
  title: string;
  description?: string;
  lesson_type: 'concept' | 'lab' | 'assessment' | 'reflection';
  estimated_minutes: number;
  requires_structured_input: boolean;
  structured_fields_schema?: any;
  content_template_json?: any;
  created_at?: Date;
}

class CurriculumLesson extends Model<CurriculumLessonAttributes> implements CurriculumLessonAttributes {
  declare id: string;
  declare module_id: string;
  declare lesson_number: number;
  declare title: string;
  declare description: string;
  declare lesson_type: 'concept' | 'lab' | 'assessment' | 'reflection';
  declare estimated_minutes: number;
  declare requires_structured_input: boolean;
  declare structured_fields_schema: any;
  declare content_template_json: any;
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
      type: DataTypes.ENUM('concept', 'lab', 'assessment', 'reflection'),
      allowNull: false,
      defaultValue: 'concept',
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
