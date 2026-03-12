import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface AlertAttributes {
  id?: string;
  type: string;
  severity: number;
  title: string;
  description?: string;
  source_agent_id?: string | null;
  source_type: string;
  impact_area?: string;
  department_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  confidence?: number | null;
  urgency: string;
  status: string;
  resolved_by?: string | null;
  resolved_at?: Date | null;
  metadata?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

class Alert extends Model<AlertAttributes> implements AlertAttributes {
  declare id: string;
  declare type: string;
  declare severity: number;
  declare title: string;
  declare description: string;
  declare source_agent_id: string | null;
  declare source_type: string;
  declare impact_area: string;
  declare department_id: string | null;
  declare entity_type: string | null;
  declare entity_id: string | null;
  declare confidence: number | null;
  declare urgency: string;
  declare status: string;
  declare resolved_by: string | null;
  declare resolved_at: Date | null;
  declare metadata: Record<string, any>;
  declare created_at: Date;
  declare updated_at: Date;
}

Alert.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: { isIn: [['info', 'insight', 'opportunity', 'warning', 'critical']] },
    },
    severity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: { min: 1, max: 5 },
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    source_agent_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    source_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'system',
    },
    impact_area: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    department_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    entity_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    entity_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    urgency: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'medium',
      validate: { isIn: [['low', 'medium', 'high', 'immediate']] },
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'new',
      validate: { isIn: [['new', 'acknowledged', 'investigating', 'resolved', 'dismissed']] },
    },
    resolved_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    resolved_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
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
    tableName: 'alerts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['status'] },
      { fields: ['type'] },
      { fields: ['severity'] },
      { fields: ['source_agent_id'] },
      { fields: ['department_id'] },
      { fields: ['created_at'] },
      { fields: ['impact_area'] },
    ],
  }
);

export default Alert;
