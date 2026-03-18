import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface ArtifactDefinitionAttributes {
  id?: string;
  session_id?: string;
  section_id?: string;
  name: string;
  description?: string;
  artifact_type?: string;
  file_types?: string[];
  instruction_prompt_id?: string;
  validation_rule?: any;
  skill_mapping?: { skill_id: string; contribution: number }[];
  required_before?: string;
  lesson_id?: string;
  required_for_session?: boolean;
  required_for_build_unlock?: boolean;
  required_for_presentation_unlock?: boolean;
  produces_variable_keys?: string[];
  requires_github_validation?: boolean;
  github_file_path?: string;
  requires_screenshot?: boolean;
  evaluation_criteria?: string;
  auto_generate_prompt_id?: string;
  versioning_enabled?: boolean;
  artifact_role?: string;
  sort_order?: number;
  created_at?: Date;
}

class ArtifactDefinition extends Model<ArtifactDefinitionAttributes> implements ArtifactDefinitionAttributes {
  declare id: string;
  declare session_id: string;
  declare section_id: string;
  declare name: string;
  declare description: string;
  declare artifact_type: string;
  declare file_types: string[];
  declare instruction_prompt_id: string;
  declare validation_rule: any;
  declare skill_mapping: { skill_id: string; contribution: number }[];
  declare required_before: string;
  declare lesson_id: string;
  declare required_for_session: boolean;
  declare required_for_build_unlock: boolean;
  declare required_for_presentation_unlock: boolean;
  declare produces_variable_keys: string[];
  declare requires_github_validation: boolean;
  declare github_file_path: string;
  declare requires_screenshot: boolean;
  declare evaluation_criteria: string;
  declare auto_generate_prompt_id: string;
  declare versioning_enabled: boolean;
  declare artifact_role: string;
  declare sort_order: number;
  declare created_at: Date;
}

ArtifactDefinition.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    session_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'live_sessions', key: 'id' },
    },
    section_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'section_configs', key: 'id' },
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    artifact_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'document',
    },
    instruction_prompt_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'prompt_templates', key: 'id' },
    },
    validation_rule: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    skill_mapping: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    required_before: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    lesson_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'curriculum_lessons', key: 'id' },
    },
    file_types: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: ['.pdf', '.docx', '.xlsx', '.pptx', '.png', '.csv'],
    },
    required_for_session: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    required_for_build_unlock: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    required_for_presentation_unlock: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    produces_variable_keys: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    requires_github_validation: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    github_file_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    requires_screenshot: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    evaluation_criteria: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    auto_generate_prompt_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'prompt_templates', key: 'id' },
    },
    versioning_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    artifact_role: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'output',
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'artifact_definitions',
    timestamps: false,
  }
);

export default ArtifactDefinition;
