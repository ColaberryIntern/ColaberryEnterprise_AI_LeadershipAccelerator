import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface ProgramBlueprintAttributes {
  id?: string;
  name: string;
  description?: string;
  goals?: string[];
  target_persona?: string;
  learning_philosophy?: string;
  core_competency_domains?: { domain_id: string; name: string; weight: number }[];
  skill_genome_mapping?: Record<string, string[]>;
  default_prompt_injection_rules?: { system_context: string; tone: string; audience_level: string };
  is_active?: boolean;
  version?: number;
  created_at?: Date;
  updated_at?: Date;
}

class ProgramBlueprint extends Model<ProgramBlueprintAttributes> implements ProgramBlueprintAttributes {
  declare id: string;
  declare name: string;
  declare description: string;
  declare goals: string[];
  declare target_persona: string;
  declare learning_philosophy: string;
  declare core_competency_domains: { domain_id: string; name: string; weight: number }[];
  declare skill_genome_mapping: Record<string, string[]>;
  declare default_prompt_injection_rules: { system_context: string; tone: string; audience_level: string };
  declare is_active: boolean;
  declare version: number;
  declare created_at: Date;
  declare updated_at: Date;
}

ProgramBlueprint.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    goals: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    target_persona: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    learning_philosophy: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    core_competency_domains: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    skill_genome_mapping: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    default_prompt_injection_rules: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
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
    tableName: 'program_blueprints',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default ProgramBlueprint;
