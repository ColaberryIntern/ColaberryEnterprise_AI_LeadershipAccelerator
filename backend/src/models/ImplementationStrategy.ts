import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface ImplementationStrategyAttributes {
  id?: string;
  project_id: string;
  name: string;
  description?: string;
  status?: string;
  priority?: string;
  phases?: Record<string, any>[];
  timeline?: Record<string, any>;
  risks?: Record<string, any>[];
  dependencies?: Record<string, any>[];
}

class ImplementationStrategy extends Model<ImplementationStrategyAttributes> implements ImplementationStrategyAttributes {
  declare id: string;
  declare project_id: string;
  declare name: string;
  declare description: string;
  declare status: string;
  declare priority: string;
  declare phases: Record<string, any>[];
  declare timeline: Record<string, any>;
  declare risks: Record<string, any>[];
  declare dependencies: Record<string, any>[];
}

ImplementationStrategy.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' } },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING(20), defaultValue: 'active' },
    priority: { type: DataTypes.STRING(20), defaultValue: 'medium' },
    phases: { type: DataTypes.JSONB, defaultValue: [] },
    timeline: { type: DataTypes.JSONB, defaultValue: {} },
    risks: { type: DataTypes.JSONB, defaultValue: [] },
    dependencies: { type: DataTypes.JSONB, defaultValue: [] },
  },
  {
    sequelize,
    tableName: 'implementation_strategies',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'name'], unique: true },
    ],
  }
);

export default ImplementationStrategy;
