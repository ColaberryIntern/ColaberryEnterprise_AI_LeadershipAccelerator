import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type ConversationStage = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type ConversationPriorityTier = 'hot' | 'warm' | 'cold';
export type ConversationStatus = 'active' | 'stalled' | 'converted' | 'lost' | 'closed';

interface StageHistoryEntry {
  stage: number;
  timestamp: string;
  trigger: string;
}

interface ConversionSignalEntry {
  signal: string;
  confidence: number;
  detected_at: string;
}

interface OpenclawConversationAttributes {
  id?: string;
  lead_id?: number | null;
  platform: string;
  thread_identifier: string;
  current_stage: number;
  stage_history?: StageHistoryEntry[];
  first_signal_id?: string | null;
  first_response_id?: string | null;
  engagement_count?: number;
  their_reply_count?: number;
  our_reply_count?: number;
  last_activity_at?: Date;
  last_their_activity_at?: Date | null;
  stall_detected_at?: Date | null;
  conversion_signals?: ConversionSignalEntry[];
  priority_tier?: ConversationPriorityTier;
  status?: ConversationStatus;
  created_at?: Date;
  updated_at?: Date;
}

class OpenclawConversation extends Model<OpenclawConversationAttributes> implements OpenclawConversationAttributes {
  declare id: string;
  declare lead_id: number | null;
  declare platform: string;
  declare thread_identifier: string;
  declare current_stage: number;
  declare stage_history: StageHistoryEntry[];
  declare first_signal_id: string | null;
  declare first_response_id: string | null;
  declare engagement_count: number;
  declare their_reply_count: number;
  declare our_reply_count: number;
  declare last_activity_at: Date;
  declare last_their_activity_at: Date | null;
  declare stall_detected_at: Date | null;
  declare conversion_signals: ConversionSignalEntry[];
  declare priority_tier: ConversationPriorityTier;
  declare status: ConversationStatus;
  declare created_at: Date;
  declare updated_at: Date;
}

OpenclawConversation.init(
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
    platform: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    thread_identifier: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    current_stage: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    stage_history: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    first_signal_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'openclaw_signals', key: 'id' },
    },
    first_response_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'openclaw_responses', key: 'id' },
    },
    engagement_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    their_reply_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    our_reply_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    last_activity_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    last_their_activity_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    stall_detected_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    conversion_signals: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    priority_tier: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'cold',
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'active',
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'openclaw_conversations',
    timestamps: false,
    indexes: [
      { fields: ['lead_id'] },
      { fields: ['platform', 'thread_identifier'], unique: true },
      { fields: ['current_stage'] },
      { fields: ['priority_tier'] },
      { fields: ['status'] },
      { fields: ['last_activity_at'] },
    ],
  },
);

export default OpenclawConversation;
