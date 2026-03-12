import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface AlertEventAttributes {
  id?: string;
  alert_id: string;
  event_type: string;
  actor_type: string;
  actor_id: string;
  details?: Record<string, any> | null;
  created_at?: Date;
}

class AlertEvent extends Model<AlertEventAttributes> implements AlertEventAttributes {
  declare id: string;
  declare alert_id: string;
  declare event_type: string;
  declare actor_type: string;
  declare actor_id: string;
  declare details: Record<string, any> | null;
  declare created_at: Date;
}

AlertEvent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    alert_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    event_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    actor_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    actor_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'alert_events',
    timestamps: false,
    indexes: [
      { fields: ['alert_id', 'created_at'] },
    ],
  }
);

export default AlertEvent;
