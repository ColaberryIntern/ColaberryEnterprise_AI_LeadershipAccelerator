import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface CommunicationLogAttributes {
  id?: string;
  lead_id?: number | null;
  campaign_id?: string | null;
  simulation_id?: string | null;
  simulation_step_id?: string | null;
  channel: string;
  direction: string;
  delivery_mode: string;
  status: string;
  to_address?: string | null;
  from_address?: string | null;
  subject?: string | null;
  body?: string | null;
  provider?: string | null;
  provider_message_id?: string | null;
  provider_response?: Record<string, any> | null;
  error_message?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: Date;
}

class CommunicationLog extends Model<CommunicationLogAttributes> implements CommunicationLogAttributes {
  declare id: string;
  declare lead_id: number | null;
  declare campaign_id: string | null;
  declare simulation_id: string | null;
  declare simulation_step_id: string | null;
  declare channel: string;
  declare direction: string;
  declare delivery_mode: string;
  declare status: string;
  declare to_address: string | null;
  declare from_address: string | null;
  declare subject: string | null;
  declare body: string | null;
  declare provider: string | null;
  declare provider_message_id: string | null;
  declare provider_response: Record<string, any> | null;
  declare error_message: string | null;
  declare metadata: Record<string, any> | null;
  declare created_at: Date;
}

CommunicationLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
    },
    campaign_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'campaigns', key: 'id' },
    },
    simulation_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'campaign_simulations', key: 'id' },
    },
    simulation_step_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'campaign_simulation_steps', key: 'id' },
    },
    channel: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    direction: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'outbound',
    },
    delivery_mode: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'live',
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    to_address: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    from_address: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    subject: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    provider: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    provider_message_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    provider_response: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    error_message: {
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
  },
  {
    sequelize,
    tableName: 'communication_logs',
    timestamps: false,
    indexes: [
      { fields: ['simulation_id', 'created_at'] },
      { fields: ['lead_id'] },
      { fields: ['campaign_id'] },
      { fields: ['provider_message_id'] },
      { fields: ['channel'] },
      { fields: ['created_at', 'channel', 'status'], name: 'idx_comm_logs_created_channel_status' },
      { fields: ['lead_id', 'created_at'], name: 'idx_comm_logs_lead_created' },
    ],
  }
);

export default CommunicationLog;
