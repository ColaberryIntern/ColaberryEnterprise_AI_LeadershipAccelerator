import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type DepartmentEventType = 'milestone' | 'risk' | 'achievement' | 'update' | 'launch' | 'review' | 'strategy_analysis' | 'initiative_created' | 'ticket_generated' | 'health_assessment' | 'opportunity_identified' | 'security_alert' | 'security_scan' | 'threat_detected';

interface DepartmentEventAttributes {
  id?: string;
  department_id: string;
  initiative_id?: string;
  event_type: DepartmentEventType;
  title: string;
  description?: string;
  severity?: string;
  metadata?: Record<string, any>;
  created_at?: Date;
}

class DepartmentEvent extends Model<DepartmentEventAttributes> implements DepartmentEventAttributes {
  declare id: string;
  declare department_id: string;
  declare initiative_id: string;
  declare event_type: DepartmentEventType;
  declare title: string;
  declare description: string;
  declare severity: string;
  declare metadata: Record<string, any>;
  declare created_at: Date;
}

DepartmentEvent.init(
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
    initiative_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'initiatives', key: 'id' },
    },
    event_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    severity: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  },
  {
    sequelize,
    tableName: 'department_events',
    timestamps: true,
    underscored: true,
    updatedAt: false,
    indexes: [
      { fields: ['department_id'] },
      { fields: ['initiative_id'] },
      { fields: ['event_type'] },
      { fields: ['created_at'] },
    ],
  }
);

export default DepartmentEvent;
