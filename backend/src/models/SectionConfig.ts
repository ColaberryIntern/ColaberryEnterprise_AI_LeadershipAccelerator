import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface SectionConfigAttributes {
  id?: string;
  lesson_id?: string;
  session_id?: string;
  section_order?: number;
  concept_text?: string;
  why_it_matters_text?: string;
  think_of_it_as_text?: string;
  strategy_text?: string;
  dialogue_text?: string;
  suggested_prompt_id?: string;
  mentor_prompt_id?: string;
  implementation_task_text?: string;
  variable_output_map?: any;
  build_phase_flag?: boolean;
  notebooklm_required?: boolean;
  notebooklm_instructions?: string;
  marketing_flag?: boolean;
  github_required_flag?: boolean;
  settings_json?: any;
  created_at?: Date;
}

class SectionConfig extends Model<SectionConfigAttributes> implements SectionConfigAttributes {
  declare id: string;
  declare lesson_id: string;
  declare session_id: string;
  declare section_order: number;
  declare concept_text: string;
  declare why_it_matters_text: string;
  declare think_of_it_as_text: string;
  declare strategy_text: string;
  declare dialogue_text: string;
  declare suggested_prompt_id: string;
  declare mentor_prompt_id: string;
  declare implementation_task_text: string;
  declare variable_output_map: any;
  declare build_phase_flag: boolean;
  declare notebooklm_required: boolean;
  declare notebooklm_instructions: string;
  declare marketing_flag: boolean;
  declare github_required_flag: boolean;
  declare settings_json: any;
  declare created_at: Date;
}

SectionConfig.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    lesson_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'curriculum_lessons', key: 'id' },
    },
    session_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'live_sessions', key: 'id' },
    },
    section_order: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    concept_text: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    why_it_matters_text: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    think_of_it_as_text: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    strategy_text: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    dialogue_text: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    suggested_prompt_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'prompt_templates', key: 'id' },
    },
    mentor_prompt_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'prompt_templates', key: 'id' },
    },
    implementation_task_text: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    variable_output_map: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    build_phase_flag: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    notebooklm_required: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    notebooklm_instructions: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    marketing_flag: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    github_required_flag: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    settings_json: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'section_configs',
    timestamps: false,
  }
);

export default SectionConfig;
