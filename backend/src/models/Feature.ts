import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface FeatureAttributes {
  id?: string;
  capability_id: string;
  name: string;
  description?: string;
  success_criteria?: string;
  status?: string;
  priority?: string;
  sort_order?: number;
  source?: string;
  created_at?: Date;
  updated_at?: Date;
}

class Feature extends Model<FeatureAttributes> implements FeatureAttributes {
  declare id: string;
  declare capability_id: string;
  declare name: string;
  declare description: string;
  declare success_criteria: string;
  declare status: string;
  declare priority: string;
  declare sort_order: number;
  declare source: string;
  declare created_at: Date;
  declare updated_at: Date;
}

Feature.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    capability_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'capabilities', key: 'id' },
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    success_criteria: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(30),
      defaultValue: 'active',
    },
    priority: {
      type: DataTypes.STRING(20),
      defaultValue: 'medium',
    },
    sort_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    source: {
      type: DataTypes.STRING(30),
      defaultValue: 'parsed',
    },
  },
  {
    sequelize,
    tableName: 'features',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['capability_id'] },
      { fields: ['capability_id', 'name'], unique: true },
    ],
  }
);

export default Feature;
