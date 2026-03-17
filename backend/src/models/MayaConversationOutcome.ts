import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type ConversationOutcomeType =
  | 'booked_call'
  | 'high_intent_no_booking'
  | 'continued_nurture'
  | 'no_response'
  | 'campaign_engagement'
  | 'information_request';

interface MayaConversationOutcomeAttributes {
  id?: string;
  lead_id: number | null;
  conversation_id: string;
  intent_score: number;
  messages_count: number;
  conversation_duration_seconds: number;
  campaign_context_json: Record<string, any> | null;
  campaign_step_at_time: number | null;
  booking_offered: boolean;
  booking_clicked: boolean;
  booking_completed: boolean;
  booking_id: string | null;
  conversation_outcome: ConversationOutcomeType;
  engagement_signals_json: Record<string, any> | null;
  created_at?: Date;
}

class MayaConversationOutcome
  extends Model<MayaConversationOutcomeAttributes>
  implements MayaConversationOutcomeAttributes
{
  declare id: string;
  declare lead_id: number | null;
  declare conversation_id: string;
  declare intent_score: number;
  declare messages_count: number;
  declare conversation_duration_seconds: number;
  declare campaign_context_json: Record<string, any> | null;
  declare campaign_step_at_time: number | null;
  declare booking_offered: boolean;
  declare booking_clicked: boolean;
  declare booking_completed: boolean;
  declare booking_id: string | null;
  declare conversation_outcome: ConversationOutcomeType;
  declare engagement_signals_json: Record<string, any> | null;
  declare created_at: Date;
}

MayaConversationOutcome.init(
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
    conversation_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    intent_score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    messages_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    conversation_duration_seconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    campaign_context_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    campaign_step_at_time: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    booking_offered: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    booking_clicked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    booking_completed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    booking_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    conversation_outcome: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'no_response',
    },
    engagement_signals_json: {
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
    tableName: 'maya_conversation_outcomes',
    timestamps: false,
    indexes: [
      { fields: ['lead_id'] },
      { fields: ['conversation_id'] },
      { fields: ['created_at'] },
      { fields: ['conversation_outcome'] },
    ],
  },
);

export default MayaConversationOutcome;
