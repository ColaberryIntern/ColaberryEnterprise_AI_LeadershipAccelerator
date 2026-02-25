import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { CampaignChannel } from './ScheduledEmail';

export interface SequenceStep {
  delay_days: number;
  channel: CampaignChannel;
  subject: string;
  body_template: string;
  voice_agent_type?: 'welcome' | 'interest';
  sms_template?: string;
  max_attempts?: number;
  fallback_channel?: CampaignChannel | null;
  step_goal?: string;
}

interface FollowUpSequenceAttributes {
  id?: string;
  name: string;
  description?: string;
  steps: SequenceStep[];
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

class FollowUpSequence extends Model<FollowUpSequenceAttributes> implements FollowUpSequenceAttributes {
  declare id: string;
  declare name: string;
  declare description: string;
  declare steps: SequenceStep[];
  declare is_active: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

FollowUpSequence.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    steps: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'follow_up_sequences',
    timestamps: false,
  }
);

export default FollowUpSequence;
