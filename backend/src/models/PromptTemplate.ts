import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface PromptTemplateAttributes {
  id?: string;
  name: string;
  prompt_type: 'suggested' | 'mentor' | 'evaluation' | 'system';
  system_prompt?: string;
  user_prompt_template?: string;
  model_id?: string;
  temperature?: number;
  max_tokens?: number;
  is_active?: boolean;
  version?: number;
  created_at?: Date;
  updated_at?: Date;
}

class PromptTemplate extends Model<PromptTemplateAttributes> implements PromptTemplateAttributes {
  declare id: string;
  declare name: string;
  declare prompt_type: 'suggested' | 'mentor' | 'evaluation' | 'system';
  declare system_prompt: string;
  declare user_prompt_template: string;
  declare model_id: string;
  declare temperature: number;
  declare max_tokens: number;
  declare is_active: boolean;
  declare version: number;
  declare created_at: Date;
  declare updated_at: Date;
}

PromptTemplate.init(
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
    prompt_type: {
      type: DataTypes.ENUM('suggested', 'mentor', 'evaluation', 'system'),
      allowNull: false,
      defaultValue: 'suggested',
    },
    system_prompt: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    user_prompt_template: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    model_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: 'gpt-4o-mini',
    },
    temperature: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0.7,
    },
    max_tokens: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1024,
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
    tableName: 'prompt_templates',
    timestamps: false,
  }
);

export default PromptTemplate;
