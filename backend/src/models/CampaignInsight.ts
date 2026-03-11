import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type InsightType = 'channel_perf' | 'timing' | 'audience' | 'message_pattern' | 'conversion';

interface CampaignInsightAttributes {
  id?: number;
  campaign_id?: number | null;
  insight_type: InsightType;
  category: string;
  insight: string;
  evidence?: Record<string, any>;
  confidence?: number;
  applicable_to?: Record<string, any>;
  times_applied?: number;
  last_applied_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class CampaignInsight extends Model<CampaignInsightAttributes> implements CampaignInsightAttributes {
  declare id: number;
  declare campaign_id: number | null;
  declare insight_type: InsightType;
  declare category: string;
  declare insight: string;
  declare evidence: Record<string, any>;
  declare confidence: number;
  declare applicable_to: Record<string, any>;
  declare times_applied: number;
  declare last_applied_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CampaignInsight.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    campaign_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'campaigns', key: 'id' },
    },
    insight_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    insight: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    evidence: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0.5,
    },
    applicable_to: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    times_applied: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    last_applied_at: {
      type: DataTypes.DATE,
      allowNull: true,
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
    tableName: 'campaign_insights',
    timestamps: false,
    indexes: [
      { fields: ['campaign_id'] },
      { fields: ['insight_type'] },
      { fields: ['category'] },
      { fields: ['confidence'] },
    ],
  }
);

export default CampaignInsight;
