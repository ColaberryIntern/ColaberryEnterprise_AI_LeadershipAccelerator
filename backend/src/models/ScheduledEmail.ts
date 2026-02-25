import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type CampaignChannel = 'email' | 'voice' | 'sms';

interface ScheduledEmailAttributes {
  id?: string;
  lead_id: number;
  sequence_id?: string;
  campaign_id?: string;
  step_index: number;
  channel: CampaignChannel;
  subject: string;
  body: string;
  to_email: string;
  to_phone?: string;
  voice_agent_type?: string;
  max_attempts: number;
  attempts_made: number;
  fallback_channel?: CampaignChannel | null;
  scheduled_for: Date;
  sent_at?: Date;
  status?: string;
  ai_instructions?: string;
  ai_generated?: boolean;
  metadata?: Record<string, any>;
  created_at?: Date;
}

class ScheduledEmail extends Model<ScheduledEmailAttributes> implements ScheduledEmailAttributes {
  declare id: string;
  declare lead_id: number;
  declare sequence_id: string;
  declare campaign_id: string;
  declare step_index: number;
  declare channel: CampaignChannel;
  declare subject: string;
  declare body: string;
  declare to_email: string;
  declare to_phone: string;
  declare voice_agent_type: string;
  declare max_attempts: number;
  declare attempts_made: number;
  declare fallback_channel: CampaignChannel | null;
  declare scheduled_for: Date;
  declare sent_at: Date;
  declare status: string;
  declare ai_instructions: string;
  declare ai_generated: boolean;
  declare metadata: Record<string, any>;
  declare created_at: Date;
}

ScheduledEmail.init(
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
    sequence_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'follow_up_sequences', key: 'id' },
    },
    campaign_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'campaigns', key: 'id' },
    },
    step_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    channel: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'email',
    },
    subject: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    to_email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    to_phone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    voice_agent_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    max_attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    attempts_made: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    fallback_channel: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    scheduled_for: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    sent_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    ai_instructions: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ai_generated: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
    tableName: 'scheduled_emails',
    timestamps: false,
  }
);

export default ScheduledEmail;
