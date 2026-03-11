import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type AdmissionsVisitorType =
  | 'new'
  | 'returning'
  | 'engaged'
  | 'high_intent'
  | 'enterprise'
  | 'ceo';

interface ConversationSummaryEntry {
  conversation_id: string;
  summary: string;
  timestamp: string;
  page_category: string;
  questions_asked: string[];
}

interface AdmissionsMemoryAttributes {
  id?: string;
  visitor_id: string;
  lead_id?: number | null;
  conversation_count?: number;
  last_conversation_id?: string | null;
  conversation_summaries?: ConversationSummaryEntry[];
  interests?: string[];
  questions_asked?: string[];
  visitor_type?: AdmissionsVisitorType;
  recommended_next_action?: string | null;
  personality_notes?: string | null;
  last_updated?: Date;
  created_at?: Date;
}

class AdmissionsMemory extends Model<AdmissionsMemoryAttributes> implements AdmissionsMemoryAttributes {
  declare id: string;
  declare visitor_id: string;
  declare lead_id: number | null;
  declare conversation_count: number;
  declare last_conversation_id: string | null;
  declare conversation_summaries: ConversationSummaryEntry[];
  declare interests: string[];
  declare questions_asked: string[];
  declare visitor_type: AdmissionsVisitorType;
  declare recommended_next_action: string | null;
  declare personality_notes: string | null;
  declare last_updated: Date;
  declare created_at: Date;
}

AdmissionsMemory.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    visitor_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    conversation_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    last_conversation_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    conversation_summaries: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    interests: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    questions_asked: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    visitor_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'new',
    },
    recommended_next_action: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    personality_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    last_updated: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'admissions_memory',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['visitor_id'] },
      { fields: ['lead_id'] },
      { fields: ['visitor_type'] },
    ],
  }
);

export default AdmissionsMemory;
