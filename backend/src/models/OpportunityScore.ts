import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface OpportunityScoreAttributes {
  id?: string;
  lead_id: number;
  visitor_id?: string | null;
  score: number;
  opportunity_level: string;
  score_components?: Record<string, any> | null;
  stall_risk: string;
  stall_reason?: string | null;
  days_in_pipeline: number;
  days_since_last_activity: number;
  recommended_actions?: Array<Record<string, any>> | null;
  conversion_probability: number;
  projected_revenue: number;
  score_updated_at: Date;
  created_at?: Date;
  updated_at?: Date;
}

class OpportunityScore extends Model<OpportunityScoreAttributes> implements OpportunityScoreAttributes {
  declare id: string;
  declare lead_id: number;
  declare visitor_id: string | null;
  declare score: number;
  declare opportunity_level: string;
  declare score_components: Record<string, any> | null;
  declare stall_risk: string;
  declare stall_reason: string | null;
  declare days_in_pipeline: number;
  declare days_since_last_activity: number;
  declare recommended_actions: Array<Record<string, any>> | null;
  declare conversion_probability: number;
  declare projected_revenue: number;
  declare score_updated_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

OpportunityScore.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: { model: 'leads', key: 'id' },
    },
    visitor_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'visitors', key: 'id' },
    },
    score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    opportunity_level: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'cold_prospect',
    },
    score_components: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    stall_risk: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'none',
    },
    stall_reason: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    days_in_pipeline: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    days_since_last_activity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    recommended_actions: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    conversion_probability: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    projected_revenue: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    score_updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
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
    tableName: 'opportunity_scores',
    timestamps: false,
    indexes: [
      { fields: ['lead_id'], unique: true },
      { fields: ['visitor_id'] },
      { fields: ['score'] },
      { fields: ['opportunity_level'] },
      { fields: ['stall_risk'] },
    ],
  }
);

export default OpportunityScore;
