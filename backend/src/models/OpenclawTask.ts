import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type OpenclawTaskType = 'scan' | 'score' | 'generate_response' | 'post_response' | 'monitor' | 'learn';
export type OpenclawTaskStatus = 'pending' | 'assigned' | 'running' | 'completed' | 'failed' | 'cancelled';

interface OpenclawTaskAttributes {
  id?: string;
  task_type: OpenclawTaskType;
  priority?: number;
  status?: OpenclawTaskStatus;
  assigned_agent?: string;
  signal_id?: string;
  session_id?: string;
  input_data?: Record<string, any>;
  output_data?: Record<string, any>;
  error_message?: string;
  retry_count?: number;
  max_retries?: number;
  scheduled_for?: Date;
  started_at?: Date;
  completed_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

class OpenclawTask extends Model<OpenclawTaskAttributes> implements OpenclawTaskAttributes {
  declare id: string;
  declare task_type: OpenclawTaskType;
  declare priority: number;
  declare status: OpenclawTaskStatus;
  declare assigned_agent: string;
  declare signal_id: string;
  declare session_id: string;
  declare input_data: Record<string, any>;
  declare output_data: Record<string, any>;
  declare error_message: string;
  declare retry_count: number;
  declare max_retries: number;
  declare scheduled_for: Date;
  declare started_at: Date;
  declare completed_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

OpenclawTask.init(
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
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'pending',
    },
    assigned_agent: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    signal_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'openclaw_signals', key: 'id' },
    },
    session_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'openclaw_sessions', key: 'id' },
    },
    input_data: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    output_data: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    retry_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    max_retries: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
    },
    scheduled_for: {
      type: DataTypes.DATE,
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
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'openclaw_tasks',
    timestamps: false,
    indexes: [
      { fields: ['status'] },
      { fields: ['task_type'] },
      { fields: ['priority'] },
      { fields: ['assigned_agent'] },
      { fields: ['scheduled_for'] },
    ],
  }
);

export default OpenclawTask;
