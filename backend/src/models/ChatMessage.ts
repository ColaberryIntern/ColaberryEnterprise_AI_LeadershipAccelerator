import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface ChatMessageAttributes {
  id?: string;
  conversation_id: string;
  role: string;
  content: string;
  tokens_used?: number | null;
  timestamp: Date;
  metadata?: Record<string, any> | null;
}

class ChatMessage extends Model<ChatMessageAttributes> implements ChatMessageAttributes {
  declare id: string;
  declare conversation_id: string;
  declare role: string;
  declare content: string;
  declare tokens_used: number | null;
  declare timestamp: Date;
  declare metadata: Record<string, any> | null;
}

ChatMessage.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    conversation_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'chat_conversations', key: 'id' },
    },
    role: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    tokens_used: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'chat_messages',
    timestamps: false,
    indexes: [
      { fields: ['conversation_id', 'timestamp'] },
    ],
  }
);

export default ChatMessage;
