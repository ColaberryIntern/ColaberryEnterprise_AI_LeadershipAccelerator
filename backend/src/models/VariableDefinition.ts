import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface VariableDefinitionAttributes {
  id?: string;
  program_id?: string;
  variable_key: string;
  display_name: string;
  description?: string;
  data_type?: 'text' | 'number' | 'boolean' | 'json' | 'date';
  default_value?: string;
  required_for_section_build?: boolean;
  optional?: boolean;
  scope?: 'section' | 'session' | 'program' | 'artifact';
  source_type?: 'user_input' | 'llm_output' | 'system' | 'admin';
  validation_regex?: string;
  sort_order?: number;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

class VariableDefinition extends Model<VariableDefinitionAttributes> implements VariableDefinitionAttributes {
  declare id: string;
  declare program_id: string;
  declare variable_key: string;
  declare display_name: string;
  declare description: string;
  declare data_type: 'text' | 'number' | 'boolean' | 'json' | 'date';
  declare default_value: string;
  declare required_for_section_build: boolean;
  declare optional: boolean;
  declare scope: 'section' | 'session' | 'program' | 'artifact';
  declare source_type: 'user_input' | 'llm_output' | 'system' | 'admin';
  declare validation_regex: string;
  declare sort_order: number;
  declare is_active: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

VariableDefinition.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    program_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'program_blueprints', key: 'id' },
    },
    variable_key: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    display_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    data_type: {
      type: DataTypes.ENUM('text', 'number', 'boolean', 'json', 'date'),
      allowNull: false,
      defaultValue: 'text',
    },
    default_value: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    required_for_section_build: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    optional: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    scope: {
      type: DataTypes.ENUM('section', 'session', 'program', 'artifact'),
      allowNull: false,
      defaultValue: 'program',
    },
    source_type: {
      type: DataTypes.ENUM('user_input', 'llm_output', 'system', 'admin'),
      allowNull: false,
      defaultValue: 'user_input',
    },
    validation_regex: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
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
    tableName: 'variable_definitions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default VariableDefinition;
