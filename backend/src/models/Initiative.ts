import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type InitiativeStatus = 'planned' | 'active' | 'completed' | 'on_hold' | 'cancelled';
export type InitiativePriority = 'critical' | 'high' | 'medium' | 'low';
export type InitiativeRiskLevel = 'low' | 'medium' | 'high' | 'critical';

interface InitiativeAttributes {
  id?: string;
  department_id: string;
  title: string;
  description?: string;
  status?: InitiativeStatus;
  priority?: InitiativePriority;
  progress?: number;
  owner?: string;
  start_date?: Date;
  target_date?: Date;
  completed_date?: Date;
  revenue_impact?: number;
  risk_level?: InitiativeRiskLevel;
  tags?: string[];
  metadata?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

class Initiative extends Model<InitiativeAttributes> implements InitiativeAttributes {
  declare id: string;
  declare department_id: string;
  declare title: string;
  declare description: string;
  declare status: InitiativeStatus;
  declare priority: InitiativePriority;
  declare progress: number;
  declare owner: string;
  declare start_date: Date;
  declare target_date: Date;
  declare completed_date: Date;
  declare revenue_impact: number;
  declare risk_level: InitiativeRiskLevel;
  declare tags: string[];
  declare metadata: Record<string, any>;
  declare created_at: Date;
  declare updated_at: Date;
}

Initiative.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    department_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'departments', key: 'id' },
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'planned',
    },
    priority: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'medium',
    },
    progress: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    owner: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    target_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    completed_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    revenue_impact: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    risk_level: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'low',
    },
    tags: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  },
  {
    sequelize,
    tableName: 'initiatives',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['department_id'] },
      { fields: ['status'] },
      { fields: ['priority'] },
    ],
  }
);

export default Initiative;
