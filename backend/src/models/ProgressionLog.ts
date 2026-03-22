import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface ProgressionLogAttributes {
  id?: string;
  project_id: string;
  action_id: string;
  decision_type: string;
  reason: string;
  confidence: number;
  metadata?: Record<string, any>;
  created_at?: Date;
}

class ProgressionLog extends Model<ProgressionLogAttributes> implements ProgressionLogAttributes {
  declare id: string;
  declare project_id: string;
  declare action_id: string;
  declare decision_type: string;
  declare reason: string;
  declare confidence: number;
  declare metadata: Record<string, any>;
  declare created_at: Date;
}

ProgressionLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    project_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'projects', key: 'id' },
    },
    action_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'next_actions', key: 'id' },
    },
    decision_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    metadata: {
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
    tableName: 'progression_logs',
    timestamps: false,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['action_id'] },
    ],
  }
);

export default ProgressionLog;
