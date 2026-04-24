import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type SkoolTaskType = 'scan_feed' | 'generate_reply' | 'generate_post' | 'post_content';
export type SkoolTaskStatus = 'pending' | 'assigned' | 'running' | 'completed' | 'failed';

interface SkoolTaskAttributes {
  id?: string;
  task_type: SkoolTaskType;
  signal_id?: string;
  response_id?: string;
  status?: SkoolTaskStatus;
  priority?: number;
  attempts?: number;
  max_attempts?: number;
  error_message?: string;
  processor_id?: string;
  started_at?: Date;
  completed_at?: Date;
  created_at?: Date;
}

class SkoolTask extends Model<SkoolTaskAttributes> implements SkoolTaskAttributes {
  declare id: string;
  declare task_type: SkoolTaskType;
  declare signal_id: string;
  declare response_id: string;
  declare status: SkoolTaskStatus;
  declare priority: number;
  declare attempts: number;
  declare max_attempts: number;
  declare error_message: string;
  declare processor_id: string;
  declare started_at: Date;
  declare completed_at: Date;
  declare created_at: Date;
}

SkoolTask.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    task_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    signal_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'skool_signals', key: 'id' },
    },
    response_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'skool_responses', key: 'id' },
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'pending',
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    max_attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    processor_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: true,
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
    tableName: 'skool_tasks',
    timestamps: false,
    indexes: [
      { fields: ['status'] },
      { fields: ['task_type'] },
      { fields: ['created_at'] },
    ],
  }
);

export default SkoolTask;
