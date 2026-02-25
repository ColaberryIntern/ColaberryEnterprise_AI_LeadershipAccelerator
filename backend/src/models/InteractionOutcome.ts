import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type OutcomeType =
  | 'sent'
  | 'opened'
  | 'clicked'
  | 'replied'
  | 'booked_meeting'
  | 'converted'
  | 'no_response'
  | 'bounced'
  | 'unsubscribed'
  | 'voicemail'
  | 'answered'
  | 'declined';

interface InteractionOutcomeAttributes {
  id?: string;
  lead_id: number;
  campaign_id?: string;
  scheduled_email_id?: string;
  channel: string;
  step_index: number;
  outcome: OutcomeType;
  lead_industry?: string;
  lead_title_category?: string;
  lead_company_size_bucket?: string;
  lead_source_type?: string;
  metadata?: Record<string, any>;
  created_at?: Date;
}

class InteractionOutcome extends Model<InteractionOutcomeAttributes> implements InteractionOutcomeAttributes {
  declare id: string;
  declare lead_id: number;
  declare campaign_id: string;
  declare scheduled_email_id: string;
  declare channel: string;
  declare step_index: number;
  declare outcome: OutcomeType;
  declare lead_industry: string;
  declare lead_title_category: string;
  declare lead_company_size_bucket: string;
  declare lead_source_type: string;
  declare metadata: Record<string, any>;
  declare created_at: Date;
}

InteractionOutcome.init(
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
    campaign_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'campaigns', key: 'id' },
    },
    scheduled_email_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'scheduled_emails', key: 'id' },
    },
    channel: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    step_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    outcome: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    lead_industry: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    lead_title_category: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    lead_company_size_bucket: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    lead_source_type: {
      type: DataTypes.STRING(20),
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
    tableName: 'interaction_outcomes',
    timestamps: false,
    indexes: [
      { fields: ['lead_id'] },
      { fields: ['campaign_id'] },
      { fields: ['scheduled_email_id'] },
      { fields: ['outcome'] },
      { fields: ['channel'] },
      { fields: ['lead_industry'] },
      { fields: ['lead_title_category'] },
      { fields: ['lead_company_size_bucket'] },
      { fields: ['lead_source_type'] },
      { fields: ['created_at'] },
    ],
  }
);

export default InteractionOutcome;
