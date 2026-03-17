import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface AgentTaskResultAttributes {
  id?: string;
  task_id: string;
  result?: Record<string, any> | null;
  success: boolean;
  notes?: string | null;
  completed_by?: string | null;
  completed_at?: Date;
}

class AgentTaskResult extends Model<AgentTaskResultAttributes> implements AgentTaskResultAttributes {
  declare id: string;
  declare task_id: string;
  declare result: Record<string, any> | null;
  declare success: boolean;
  declare notes: string | null;
  declare completed_by: string | null;
  declare completed_at: Date;
}

AgentTaskResult.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    task_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'agent_tasks', key: 'id' },
    },
    result: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    success: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    completed_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    completed_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'agent_task_results',
    timestamps: false,
    indexes: [
      { fields: ['task_id'] },
      { fields: ['completed_by'] },
      { fields: ['completed_at'] },
    ],
  }
);

export default AgentTaskResult;
