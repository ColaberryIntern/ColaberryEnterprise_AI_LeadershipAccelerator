import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

interface AgentTaskAttributes {
  id?: string;
  task_type: string;
  description: string;
  assigned_department?: string | null;
  assigned_agent?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  context?: Record<string, any> | null;
  created_by?: string | null;
  ticket_id?: string | null;
  initiative_id?: string | null;
  due_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class AgentTask extends Model<AgentTaskAttributes> implements AgentTaskAttributes {
  declare id: string;
  declare task_type: string;
  declare description: string;
  declare assigned_department: string | null;
  declare assigned_agent: string | null;
  declare status: TaskStatus;
  declare priority: TaskPriority;
  declare context: Record<string, any> | null;
  declare created_by: string | null;
  declare ticket_id: string | null;
  declare initiative_id: string | null;
  declare due_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

AgentTask.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    task_type: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'investigation | repair | optimization | report | strategic',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    assigned_department: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    assigned_agent: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    priority: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'medium',
    },
    context: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    ticket_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'tickets', key: 'id' },
      comment: 'Linked ticket for tracking',
    },
    initiative_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'strategic_initiatives', key: 'id' },
      comment: 'Parent strategic initiative',
    },
    due_at: {
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
    tableName: 'agent_tasks',
    timestamps: false,
    indexes: [
      { fields: ['status'] },
      { fields: ['priority'] },
      { fields: ['assigned_department'] },
      { fields: ['assigned_agent'] },
      { fields: ['created_by'] },
      { fields: ['ticket_id'] },
      { fields: ['initiative_id'] },
      { fields: ['created_at'] },
    ],
  }
);

export default AgentTask;
