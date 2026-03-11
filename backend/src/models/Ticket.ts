import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type TicketStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
export type TicketPriority = 'critical' | 'high' | 'medium' | 'low';
export type TicketType = 'task' | 'bug' | 'feature' | 'curriculum' | 'agent_action' | 'strategic';
export type TicketActorType = 'human' | 'cory' | 'agent';

interface TicketAttributes {
  id?: string;
  ticket_number?: number;
  title: string;
  description?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  type?: TicketType;
  source?: string;
  created_by_type: TicketActorType;
  created_by_id: string;
  assigned_to_type?: TicketActorType | null;
  assigned_to_id?: string | null;
  parent_ticket_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, any>;
  confidence?: number | null;
  estimated_effort?: string | null;
  due_date?: Date | null;
  completed_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class Ticket extends Model<TicketAttributes> implements TicketAttributes {
  declare id: string;
  declare ticket_number: number;
  declare title: string;
  declare description: string;
  declare status: TicketStatus;
  declare priority: TicketPriority;
  declare type: TicketType;
  declare source: string;
  declare created_by_type: TicketActorType;
  declare created_by_id: string;
  declare assigned_to_type: TicketActorType | null;
  declare assigned_to_id: string | null;
  declare parent_ticket_id: string | null;
  declare entity_type: string | null;
  declare entity_id: string | null;
  declare metadata: Record<string, any>;
  declare confidence: number | null;
  declare estimated_effort: string | null;
  declare due_date: Date | null;
  declare completed_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

Ticket.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ticket_number: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      unique: true,
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'backlog',
    },
    priority: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'medium',
    },
    type: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'task',
    },
    source: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'manual',
    },
    created_by_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    created_by_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    assigned_to_type: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    assigned_to_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    parent_ticket_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'tickets', key: 'id' },
    },
    entity_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    entity_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    estimated_effort: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    due_date: {
      type: DataTypes.DATEONLY,
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
    tableName: 'tickets',
    timestamps: false,
    indexes: [
      { fields: ['status'] },
      { fields: ['priority', 'status'] },
      { fields: ['source'] },
      { fields: ['parent_ticket_id'] },
      { fields: ['entity_type', 'entity_id'] },
      { fields: ['assigned_to_id'] },
    ],
  }
);

export default Ticket;
