import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface SessionChatMessageAttributes {
  id?: string;
  session_id: string;
  enrollment_id: string;
  sender_name: string;
  content: string;
  created_at?: Date;
}

class SessionChatMessage extends Model<SessionChatMessageAttributes> implements SessionChatMessageAttributes {
  declare id: string;
  declare session_id: string;
  declare enrollment_id: string;
  declare sender_name: string;
  declare content: string;
  declare created_at: Date;
}

SessionChatMessage.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    session_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'live_sessions', key: 'id' },
    },
    enrollment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'enrollments', key: 'id' },
    },
    sender_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'session_chat_messages',
    timestamps: false,
    indexes: [
      { fields: ['session_id', 'created_at'] },
    ],
  }
);

export default SessionChatMessage;
