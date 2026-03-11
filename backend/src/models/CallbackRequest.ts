import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface CallbackRequestAttributes {
  id?: string;
  visitor_id: string;
  lead_id?: number | null;
  conversation_id?: string | null;
  request_timestamp?: Date;
  requested_time?: Date | null;
  callback_status?: string;
  scheduled_time?: Date | null;
  completed_at?: Date | null;
  agent_notes?: string | null;
  created_at?: Date;
}

class CallbackRequest extends Model<CallbackRequestAttributes> implements CallbackRequestAttributes {
  declare id: string;
  declare visitor_id: string;
  declare lead_id: number | null;
  declare conversation_id: string | null;
  declare request_timestamp: Date;
  declare requested_time: Date | null;
  declare callback_status: string;
  declare scheduled_time: Date | null;
  declare completed_at: Date | null;
  declare agent_notes: string | null;
  declare created_at: Date;
}

CallbackRequest.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    visitor_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    conversation_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    request_timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    requested_time: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    callback_status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    scheduled_time: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    agent_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'callback_requests',
    timestamps: false,
    indexes: [
      { fields: ['visitor_id'] },
      { fields: ['callback_status'] },
      { fields: ['scheduled_time'] },
    ],
  }
);

export default CallbackRequest;
