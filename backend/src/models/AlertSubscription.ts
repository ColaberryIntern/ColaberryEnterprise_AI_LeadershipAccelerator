import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface AlertSubscriptionAttributes {
  id?: string;
  alert_type: string;
  impact_area: string;
  min_severity: number;
  channels: string[];
  enabled: boolean;
  created_at?: Date;
  updated_at?: Date;
}

class AlertSubscription extends Model<AlertSubscriptionAttributes> implements AlertSubscriptionAttributes {
  declare id: string;
  declare alert_type: string;
  declare impact_area: string;
  declare min_severity: number;
  declare channels: string[];
  declare enabled: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

AlertSubscription.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    alert_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: '*',
    },
    impact_area: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: '*',
    },
    min_severity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    channels: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: ['dashboard'],
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
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
    tableName: 'alert_subscriptions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default AlertSubscription;
