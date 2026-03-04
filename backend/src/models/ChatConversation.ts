import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface ChatConversationAttributes {
  id?: string;
  visitor_id: string;
  lead_id?: number | null;
  session_id?: string | null;
  status: string;
  started_at: Date;
  ended_at?: Date | null;
  message_count: number;
  visitor_message_count: number;
  page_url?: string | null;
  page_category?: string | null;
  trigger_type: string;
  trigger_context?: Record<string, any> | null;
  ai_system_prompt?: string | null;
  summary?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: Date;
  updated_at?: Date;
}

class ChatConversation extends Model<ChatConversationAttributes> implements ChatConversationAttributes {
  declare id: string;
  declare visitor_id: string;
  declare lead_id: number | null;
  declare session_id: string | null;
  declare status: string;
  declare started_at: Date;
  declare ended_at: Date | null;
  declare message_count: number;
  declare visitor_message_count: number;
  declare page_url: string | null;
  declare page_category: string | null;
  declare trigger_type: string;
  declare trigger_context: Record<string, any> | null;
  declare ai_system_prompt: string | null;
  declare summary: string | null;
  declare metadata: Record<string, any> | null;
  declare created_at: Date;
  declare updated_at: Date;
}

ChatConversation.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    visitor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'visitors', key: 'id' },
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
    },
    session_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'visitor_sessions', key: 'id' },
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active',
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    ended_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    message_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    visitor_message_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    page_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    page_category: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    trigger_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'visitor_initiated',
    },
    trigger_context: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    ai_system_prompt: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
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
    tableName: 'chat_conversations',
    timestamps: false,
    indexes: [
      { fields: ['visitor_id'] },
      { fields: ['lead_id'] },
      { fields: ['status'] },
      { fields: ['started_at'] },
    ],
  }
);

export default ChatConversation;
