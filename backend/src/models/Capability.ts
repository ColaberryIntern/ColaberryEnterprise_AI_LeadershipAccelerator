import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface CapabilityAttributes {
  id?: string;
  project_id: string;
  name: string;
  description?: string;
  status?: string;
  priority?: string;
  sort_order?: number;
  source?: string;
}

class Capability extends Model<CapabilityAttributes> implements CapabilityAttributes {
  declare id: string;
  declare project_id: string;
  declare name: string;
  declare description: string;
  declare status: string;
  declare priority: string;
  declare sort_order: number;
  declare source: string;
}

Capability.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' } },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING(30), defaultValue: 'active' },
    priority: { type: DataTypes.STRING(20), defaultValue: 'medium' },
    sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
    source: { type: DataTypes.STRING(30), defaultValue: 'parsed' },
  },
  {
    sequelize, tableName: 'capabilities', timestamps: true, underscored: true,
    indexes: [{ fields: ['project_id'] }, { fields: ['project_id', 'name'], unique: true }],
  }
);

export default Capability;
