import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface CurriculumTypeDefinitionAttributes {
  id?: string;
  slug: string;
  label: string;
  student_label: string;
  description?: string;
  icon?: string;
  badge_class?: string;
  can_create_variables?: boolean;
  can_create_artifacts?: boolean;
  applicable_prompt_pairs?: string[];
  default_prompts?: Record<string, { system: string; user: string }>;
  settings_schema?: Record<string, any>;
  is_system?: boolean;
  is_active?: boolean;
  display_order?: number;
  created_at?: Date;
  updated_at?: Date;
}

class CurriculumTypeDefinition extends Model<CurriculumTypeDefinitionAttributes> implements CurriculumTypeDefinitionAttributes {
  declare id: string;
  declare slug: string;
  declare label: string;
  declare student_label: string;
  declare description: string;
  declare icon: string;
  declare badge_class: string;
  declare can_create_variables: boolean;
  declare can_create_artifacts: boolean;
  declare applicable_prompt_pairs: string[];
  declare default_prompts: Record<string, { system: string; user: string }>;
  declare settings_schema: Record<string, any>;
  declare is_system: boolean;
  declare is_active: boolean;
  declare display_order: number;
  declare created_at: Date;
  declare updated_at: Date;
}

CurriculumTypeDefinition.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    slug: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    label: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    student_label: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    icon: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'bi-square',
    },
    badge_class: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'bg-secondary',
    },
    can_create_variables: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    can_create_artifacts: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    applicable_prompt_pairs: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    default_prompts: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    settings_schema: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    is_system: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    display_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
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
    tableName: 'curriculum_type_definitions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default CurriculumTypeDefinition;
