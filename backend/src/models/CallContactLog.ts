import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface CallContactLogAttributes {
  id?: string;
  visitor_id: string;
  call_timestamp?: Date;
  call_type: string;
  campaign_source?: string | null;
  reason_for_call: string;
  approved_by_agent: string;
  call_status?: string;
  synthflow_call_id?: string | null;
  created_at?: Date;
}

class CallContactLog extends Model<CallContactLogAttributes> implements CallContactLogAttributes {
  declare id: string;
  declare visitor_id: string;
  declare call_timestamp: Date;
  declare call_type: string;
  declare campaign_source: string | null;
  declare reason_for_call: string;
  declare approved_by_agent: string;
  declare call_status: string;
  declare synthflow_call_id: string | null;
  declare created_at: Date;
}

CallContactLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    visitor_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    call_timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    call_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    campaign_source: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    reason_for_call: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    approved_by_agent: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    call_status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    synthflow_call_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'call_contact_logs',
    timestamps: false,
    indexes: [
      { fields: ['visitor_id', 'call_timestamp'] },
      { fields: ['call_status'] },
    ],
  }
);

export default CallContactLog;
