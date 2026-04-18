import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type RawLeadPayloadStatus = 'pending' | 'accepted' | 'rejected' | 'error';

interface RawLeadPayloadAttributes {
  id: string;
  source_slug?: string | null;
  entry_slug?: string | null;
  headers?: Record<string, any> | null;
  body?: any;
  remote_ip?: string | null;
  received_at?: Date;
  resulting_lead_id?: number | null;
  status: RawLeadPayloadStatus;
  error_message?: string | null;
}

class RawLeadPayload extends Model<RawLeadPayloadAttributes> implements RawLeadPayloadAttributes {
  declare id: string;
  declare source_slug: string | null;
  declare entry_slug: string | null;
  declare headers: Record<string, any> | null;
  declare body: any;
  declare remote_ip: string | null;
  declare received_at: Date;
  declare resulting_lead_id: number | null;
  declare status: RawLeadPayloadStatus;
  declare error_message: string | null;
}

RawLeadPayload.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    source_slug: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    entry_slug: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    headers: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    body: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    remote_ip: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    received_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    resulting_lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'raw_lead_payloads',
    timestamps: false,
    indexes: [
      { fields: ['received_at'], name: 'idx_raw_payloads_received_at' },
      { fields: ['status'], name: 'idx_raw_payloads_status' },
      { fields: ['source_slug', 'entry_slug'], name: 'idx_raw_payloads_source_entry' },
      { fields: ['resulting_lead_id'], name: 'idx_raw_payloads_lead' },
    ],
  }
);

export default RawLeadPayload;
