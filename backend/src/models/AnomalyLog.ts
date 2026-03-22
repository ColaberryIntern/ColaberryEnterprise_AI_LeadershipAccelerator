import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface AnomalyLogAttributes {
  id?: string;
  project_id: string;
  anomaly_type: string;
  details?: Record<string, any>;
  severity?: string;
  created_at?: Date;
}

class AnomalyLog extends Model<AnomalyLogAttributes> implements AnomalyLogAttributes {
  declare id: string;
  declare project_id: string;
  declare anomaly_type: string;
  declare details: Record<string, any>;
  declare severity: string;
  declare created_at: Date;
}

AnomalyLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' } },
    anomaly_type: { type: DataTypes.STRING(50), allowNull: false },
    details: { type: DataTypes.JSONB, allowNull: true },
    severity: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'low' },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'anomaly_logs',
    timestamps: false,
    indexes: [{ fields: ['project_id'] }],
  }
);

export default AnomalyLog;
