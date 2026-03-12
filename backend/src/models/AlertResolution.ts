import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface AlertResolutionAttributes {
  id?: string;
  alert_id: string;
  resolution_type: string;
  resolution_notes?: string | null;
  actions_taken?: Record<string, any>[] | null;
  resolved_by_type: string;
  resolved_by_id: string;
  time_to_resolve_ms?: number | null;
  created_at?: Date;
}

class AlertResolution extends Model<AlertResolutionAttributes> implements AlertResolutionAttributes {
  declare id: string;
  declare alert_id: string;
  declare resolution_type: string;
  declare resolution_notes: string | null;
  declare actions_taken: Record<string, any>[] | null;
  declare resolved_by_type: string;
  declare resolved_by_id: string;
  declare time_to_resolve_ms: number | null;
  declare created_at: Date;
}

AlertResolution.init(
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
    resolution_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    resolution_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    actions_taken: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    resolved_by_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    resolved_by_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    time_to_resolve_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'alert_resolutions',
    timestamps: false,
    indexes: [
      { fields: ['alert_id'] },
    ],
  }
);

export default AlertResolution;
