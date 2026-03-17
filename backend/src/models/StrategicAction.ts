import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface StrategicActionAttributes {
  id?: string;
  decision_id?: string | null;
  action_type: string;
  description: string;
  department?: string | null;
  outcome?: string;
  outcome_details?: Record<string, any> | null;
  started_at?: Date;
  completed_at?: Date | null;
  created_at?: Date;
}

class StrategicAction extends Model<StrategicActionAttributes> implements StrategicActionAttributes {
  declare id: string;
  declare decision_id: string | null;
  declare action_type: string;
  declare description: string;
  declare department: string | null;
  declare outcome: string;
  declare outcome_details: Record<string, any> | null;
  declare started_at: Date;
  declare completed_at: Date | null;
  declare created_at: Date;
}

StrategicAction.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    decision_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'intelligence_decisions', key: 'decision_id' },
    },
    action_type: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    department: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    outcome: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
      comment: 'pending | success | partial | failed',
    },
    outcome_details: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    started_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'strategic_actions',
    timestamps: false,
    indexes: [
      { fields: ['decision_id'] },
      { fields: ['department'] },
      { fields: ['outcome'] },
      { fields: ['created_at'] },
    ],
  }
);

export default StrategicAction;
