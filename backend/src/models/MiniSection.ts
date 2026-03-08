import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type MiniSectionType = 'executive_reality_check' | 'ai_strategy' | 'prompt_template' | 'implementation_task' | 'knowledge_check';

export interface MiniSectionAttributes {
  id?: string;
  lesson_id: string;
  mini_section_type: MiniSectionType;
  mini_section_order: number;
  title: string;
  description?: string;
  concept_prompt_template_id?: string;
  build_prompt_template_id?: string;
  mentor_prompt_template_id?: string;
  associated_skill_ids?: string[];
  associated_variable_keys?: string[];
  associated_artifact_ids?: string[];
  creates_variable_keys?: string[];
  creates_artifact_ids?: string[];
  knowledge_check_config?: { enabled: boolean; question_count: number; pass_score: number };
  completion_weight?: number;
  is_active?: boolean;
  settings_json?: any;
  created_at?: Date;
  updated_at?: Date;
}

class MiniSection extends Model<MiniSectionAttributes> implements MiniSectionAttributes {
  declare id: string;
  declare lesson_id: string;
  declare mini_section_type: MiniSectionType;
  declare mini_section_order: number;
  declare title: string;
  declare description: string;
  declare concept_prompt_template_id: string;
  declare build_prompt_template_id: string;
  declare mentor_prompt_template_id: string;
  declare associated_skill_ids: string[];
  declare associated_variable_keys: string[];
  declare associated_artifact_ids: string[];
  declare creates_variable_keys: string[];
  declare creates_artifact_ids: string[];
  declare knowledge_check_config: { enabled: boolean; question_count: number; pass_score: number };
  declare completion_weight: number;
  declare is_active: boolean;
  declare settings_json: any;
  declare created_at: Date;
  declare updated_at: Date;
}

MiniSection.init(
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
    mini_section_type: {
      type: DataTypes.ENUM('executive_reality_check', 'ai_strategy', 'prompt_template', 'implementation_task', 'knowledge_check'),
      allowNull: false,
    },
    mini_section_order: {
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
    concept_prompt_template_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'prompt_templates', key: 'id' },
    },
    build_prompt_template_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'prompt_templates', key: 'id' },
    },
    mentor_prompt_template_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'prompt_templates', key: 'id' },
    },
    associated_skill_ids: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    associated_variable_keys: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    associated_artifact_ids: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    creates_variable_keys: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    creates_artifact_ids: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    knowledge_check_config: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    completion_weight: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 1.0,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    settings_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'mini_sections',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default MiniSection;
