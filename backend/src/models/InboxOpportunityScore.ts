import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// Deterministic, explainable Opportunity Risk Score for a hidden email.
// One row per (email_id, report_date) so the daily recompute is idempotent.
// `factors` is the full audit trail of how the score was derived — every
// point is attributable, so the report never shows a black-box number.

export type OpportunityBand = 'high' | 'medium' | 'low';

// A single contribution to the score. points may be negative (penalties).
export interface ScoreFactor {
  factor: string;   // stable key, e.g. 'vip_sender', 'strategic_keyword'
  label: string;    // human-readable, e.g. 'Sender is a VIP'
  points: number;   // signed contribution
  detail?: string;  // evidence, e.g. 'matched keyword: "contract"'
}

// An extracted topic/entity used to build the heat-map word cloud.
export interface ScoreTopic {
  topic: string;
  weight: number;   // 1 per occurrence in this email's surfaces
}

interface InboxOpportunityScoreAttributes {
  id?: string;
  email_id: string;
  report_date: string;          // YYYY-MM-DD (DATEONLY) — daily idempotency key
  score: number;                // 0-100
  band: OpportunityBand;
  confidence: number;           // 0-100, copied from classification confidence
  reason_hidden: string | null; // denormalized routing reason for fast reads
  hidden_state: string;         // AUTOMATION | SILENT_HOLD | ASK_USER
  factors: ScoreFactor[];
  topics: ScoreTopic[];
  computed_at: Date;
}

class InboxOpportunityScore
  extends Model<InboxOpportunityScoreAttributes>
  implements InboxOpportunityScoreAttributes
{
  declare id: string;
  declare email_id: string;
  declare report_date: string;
  declare score: number;
  declare band: OpportunityBand;
  declare confidence: number;
  declare reason_hidden: string | null;
  declare hidden_state: string;
  declare factors: ScoreFactor[];
  declare topics: ScoreTopic[];
  declare computed_at: Date;
}

InboxOpportunityScore.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inbox_emails', key: 'id' },
    },
    report_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    band: {
      type: DataTypes.ENUM('high', 'medium', 'low'),
      allowNull: false,
      defaultValue: 'low',
    },
    confidence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    reason_hidden: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    hidden_state: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    factors: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    topics: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    computed_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'inbox_opportunity_scores',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['email_id', 'report_date'],
        name: 'idx_inbox_opp_scores_email_date',
      },
      {
        fields: ['report_date'],
        name: 'idx_inbox_opp_scores_report_date',
      },
      {
        fields: ['score'],
        name: 'idx_inbox_opp_scores_score',
      },
    ],
  }
);

export default InboxOpportunityScore;
