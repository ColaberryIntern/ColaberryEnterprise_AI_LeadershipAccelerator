import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { CampaignChannel } from './ScheduledEmail';
import type { BrainPiece } from '../services/openHouseBrain';

export interface SequenceStep {
  delay_days: number;
  minutes_before_call?: number;
  days_before_cohort_start?: number;
  /** OH1: minutes before the start of the Open House the lead registered for (openHouseCountdown.ts). */
  minutes_before_event?: number;
  channel: CampaignChannel;
  subject: string;
  body_template: string;
  voice_agent_type?: 'welcome' | 'interest';
  /** AI prompt/instructions for voice calls — not a script, but instructions for the AI agent.
   *  Supports variables: {{name}}, {{company}}, {{title}}, {{cohort_name}}, {{cohort_start}}, {{seats_remaining}} */
  voice_prompt?: string;
  sms_template?: string;
  max_attempts?: number;
  fallback_channel?: CampaignChannel | null;
  step_goal?: string;
  /** OH1f: the one piece of the content brain this step's email is built around (openHouseBrain.ts). */
  brain_piece?: BrainPiece;
  /** AI instructions — what the AI should achieve/say in this step.
   *  The AI generates the actual message content at send time using this + lead context.
   *  When set, this is the primary content source; body_template becomes fallback. */
  ai_instructions?: string;
  ai_tone?: string;
  ai_context_notes?: string;
  /**
   * OH1w: who this step is for, in an event follow-up (openHouseFollowup.ts). A sequence with
   * any tagged step is booked per person when the event ends: each person gets only the steps
   * tagged for them (attended or missed; untagged = everyone). It is never chained or enrolled.
   */
  audience?: 'attended' | 'missed';
}

interface FollowUpSequenceAttributes {
  id?: string;
  name: string;
  description?: string;
  steps: SequenceStep[];
  is_active?: boolean;
  /** Owning tenant. NULL means the shared platform sequence library. */
  tenant_id?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class FollowUpSequence extends Model<FollowUpSequenceAttributes> implements FollowUpSequenceAttributes {
  declare id: string;
  declare name: string;
  declare description: string;
  declare steps: SequenceStep[];
  declare is_active: boolean;
  declare tenant_id: string | null;
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
    // Declared because the DDL adds this column and Sequelize only touches
    // attributes the model knows about. NULL = shared platform library.
    tenant_id: { type: DataTypes.UUID, allowNull: true },
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
