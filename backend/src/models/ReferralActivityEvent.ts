import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type ReferralEventType =
  | 'referral_submitted'
  | 'lead_created'
  | 'campaign_assigned'
  | 'email_sent'
  | 'email_opened'
  | 'link_clicked'
  | 'meeting_scheduled'
  | 'enrollment_completed'
  | 'commission_earned';

interface ReferralActivityEventAttributes {
  id?: string;
  referral_id: string;
  event_type: ReferralEventType;
  event_timestamp?: Date;
  metadata?: Record<string, any>;
}

class ReferralActivityEvent extends Model<ReferralActivityEventAttributes> implements ReferralActivityEventAttributes {
  declare id: string;
  declare referral_id: string;
  declare event_type: ReferralEventType;
  declare event_timestamp: Date;
  declare metadata: Record<string, any>;
}

ReferralActivityEvent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    referral_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'alumni_referrals', key: 'id' },
    },
    event_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    event_timestamp: {
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
    tableName: 'referral_activity_events',
    timestamps: false,
    indexes: [
      { fields: ['referral_id'] },
      { fields: ['event_type'] },
      { fields: ['event_timestamp'] },
    ],
  }
);

export default ReferralActivityEvent;
