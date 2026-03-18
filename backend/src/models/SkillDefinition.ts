import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class SkillDefinition extends Model {
  declare id: string;
  declare layer_id: string;
  declare domain_id: string;
  declare skill_id: string;
  declare name: string;
  declare description: string;
  declare weights: Record<string, number> | null;
  declare mastery_threshold: number;
  declare skill_type: string;
  declare is_active: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

SkillDefinition.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    layer_id: { type: DataTypes.STRING(50), allowNull: false },
    domain_id: { type: DataTypes.STRING(50), allowNull: false },
    skill_id: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    weights: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
    mastery_threshold: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0.7 },
    skill_type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'core' },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'skill_definitions',
    timestamps: false,
    indexes: [
      { fields: ['layer_id', 'domain_id'] },
    ],
  }
);

export default SkillDefinition;
