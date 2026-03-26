import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type OpportunityType = 'upsell' | 'cross_sell' | 'expansion' | 'new_segment' | 'enterprise';
export type OpportunityStatus = 'detected' | 'validated' | 'pursued' | 'converted' | 'dismissed';
export type OpportunityUrgency = 'low' | 'medium' | 'high';

interface RevenueOpportunityAttributes {
  id?: string;
  opportunity_type: OpportunityType;
  entity_type: string;
  entity_id: string;
  department?: string;
  title: string;
  description?: string;
  estimated_value?: number;
  confidence?: number;
  urgency?: OpportunityUrgency;
  evidence?: Record<string, any>;
  recommended_actions?: Record<string, any>;
  status?: OpportunityStatus;
  source_channel?: string;
  attribution_chain?: Record<string, any>;
  deal_closed_at?: Date;
  lead_id?: number;
  created_at?: Date;
  updated_at?: Date;
}

class RevenueOpportunity extends Model<RevenueOpportunityAttributes> implements RevenueOpportunityAttributes {
  declare id: string;
  declare opportunity_type: OpportunityType;
  declare entity_type: string;
  declare entity_id: string;
  declare department: string;
  declare title: string;
  declare description: string;
  declare estimated_value: number;
  declare confidence: number;
  declare urgency: OpportunityUrgency;
  declare evidence: Record<string, any>;
  declare recommended_actions: Record<string, any>;
  declare status: OpportunityStatus;
  declare source_channel: string;
  declare attribution_chain: Record<string, any>;
  declare deal_closed_at: Date;
  declare lead_id: number;
  declare created_at: Date;
  declare updated_at: Date;
}

RevenueOpportunity.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    opportunity_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    entity_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    entity_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    department: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING(300),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    estimated_value: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    urgency: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'medium',
    },
    evidence: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    recommended_actions: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'detected',
    },
    source_channel: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    attribution_chain: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    deal_closed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
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
    tableName: 'revenue_opportunities',
    timestamps: false,
    indexes: [
      { fields: ['status'] },
      { fields: ['entity_type', 'entity_id'] },
      { fields: ['department'] },
      { fields: ['estimated_value'] },
      { fields: ['opportunity_type'] },
      { fields: ['source_channel'] },
      { fields: ['lead_id'] },
    ],
  }
);

export default RevenueOpportunity;
