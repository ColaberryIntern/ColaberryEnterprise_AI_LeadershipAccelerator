import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface UnsubscribeEventAttributes {
  id?: string;
  lead_id: number;
  channel: string;
  reason?: string;
  source?: string;
  campaign_id?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: Date;
}

class UnsubscribeEvent extends Model<UnsubscribeEventAttributes> implements UnsubscribeEventAttributes {
  declare id: string;
  declare lead_id: number;
  declare channel: string;
  declare reason: string;
  declare source: string;
  declare campaign_id: string | null;
  declare metadata: Record<string, any> | null;
  declare created_at: Date;
}

UnsubscribeEvent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'leads', key: 'id' },
    },
    channel: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: 'email | sms | voice | all',
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    source: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'system',
      comment: 'mandrill_unsub | mandrill_spam | sms_stop | manual | api | system',
    },
    campaign_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'campaigns', key: 'id' },
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
    tableName: 'unsubscribe_events',
    timestamps: false,
    indexes: [
      {
        name: 'idx_unsub_events_lead_channel',
        fields: ['lead_id', 'channel'],
      },
      {
        name: 'idx_unsub_events_lead',
        fields: ['lead_id'],
      },
      {
        name: 'idx_unsub_events_created',
        fields: ['created_at'],
      },
    ],
  }
);

export default UnsubscribeEvent;
